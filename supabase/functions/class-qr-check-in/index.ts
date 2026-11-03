import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  matchesClassQrIdentity,
  parseClassQrCheckinInput,
} from '../_shared/classQrCheckin.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function respond(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return respond(405, { message: 'Method not allowed.' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[ClassQrCheckIn] Supabase server configuration is missing.');
    return respond(500, { message: 'Attendance check-in is temporarily unavailable.' });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return respond(400, { message: 'Invalid check-in request.' });
  }

  const input = parseClassQrCheckinInput(body);
  if (!input) {
    return respond(400, { message: 'Enter a valid QR code, 12-digit LRN, and identity verifier.' });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: session, error: sessionError } = await admin
      .from('class_qr_sessions')
      .select('id, section_id, subject_id, expires_at, revoked_at')
      .eq('token', input.token)
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
      return respond(400, { message: 'This QR session is invalid or expired. Ask the teacher for the current QR code.' });
    }

    const { data: student, error: studentError } = await admin
      .from('students')
      .select('id, lrn, first_name, last_name, birthdate, section_id')
      .eq('lrn', input.lrn)
      .maybeSingle();

    if (studentError) throw studentError;
    if (!student || !matchesClassQrIdentity(student.last_name, student.birthdate, input.verifier)) {
      return respond(400, { message: 'Student details could not be verified. Check the LRN and last name or birth date.' });
    }
    if (student.section_id !== session.section_id) {
      return respond(403, { message: 'You are not enrolled in this class section.' });
    }

    const { error: insertError } = await admin
      .from('class_qr_checkins')
      .insert({
        session_id: session.id,
        student_id: student.id,
        section_id: session.section_id,
        subject_id: session.subject_id,
      });

    if (insertError?.code === '23505') {
      return respond(409, { message: 'You have already checked in for this subject today.' });
    }
    if (insertError) throw insertError;

    const studentName = `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Student';
    return respond(200, {
      success: true,
      studentName,
      status: 'present',
      message: 'Attendance marked as PRESENT!',
    });
  } catch (error) {
    console.error('[ClassQrCheckIn] Check-in persistence failed:', error);
    return respond(500, { message: 'Attendance could not be saved. Please try again or contact the teacher.' });
  }
});
