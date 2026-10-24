import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const siteUrl = Deno.env.get('SITE_URL') || req.headers.get('origin') || 'http://localhost:5173';

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error: missing Supabase environment variables' }),
        { status: 500, headers: corsHeaders }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: missing Authorization header' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const caller = createClient(supabaseUrl, anonKey || serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: userErr } = await caller.auth.getUser();
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: invalid or expired session' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify caller is admin or teacher
    const { data: callerStaff } = await admin
      .from('staff_profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single();

    if (!callerStaff || !callerStaff.is_active || !['admin', 'teacher'].includes(callerStaff.role)) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: caller is not an authorized faculty member or administrator' }),
        { status: 403, headers: corsHeaders }
      );
    }

    let body: {
      action?: 'invite' | 'resend' | 'revoke';
      guardian_id?: string;
      student_id?: string;
      email?: string;
      mobile_number?: string;
      full_name?: string;
    } = {};

    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON request body' }),
        { status: 400, headers: corsHeaders }
      );
    }

    const { action = 'invite', guardian_id, student_id, email, mobile_number, full_name } = body;

    if (!guardian_id) {
      return new Response(
        JSON.stringify({ error: 'guardian_id is required' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // ── Revoke Action ──
    if (action === 'revoke') {
      const { data: gData } = await admin
        .from('guardians')
        .select('user_id')
        .eq('id', guardian_id)
        .single();

      if (gData?.user_id) {
        await admin.auth.admin.deleteUser(gData.user_id).catch(() => {});
      }

      await admin
        .from('guardians')
        .update({
          user_id: null,
          invited_at: null,
          activated_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', guardian_id);

      return new Response(
        JSON.stringify({ success: true, message: 'Guardian invitation revoked successfully.' }),
        { status: 200, headers: corsHeaders }
      );
    }

    // ── Invite / Resend Action ──
    const targetEmail = (email || '').trim().toLowerCase();
    const effectiveEmail = targetEmail || `${mobile_number?.replace(/[^0-9]/g, '') || guardian_id}@guardian.srnhs.local`;
    const guardianName = (full_name || 'Guardian').trim();

    let authUserId: string | null = null;

    // Check if user already exists
    const { data: existingUser } = await admin.auth.admin.getUserByEmail(effectiveEmail).catch(() => ({ data: null }));

    if (existingUser?.user) {
      authUserId = existingUser.user.id;
    } else {
      const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(effectiveEmail, {
        data: { full_name: guardianName, role: 'guardian' },
        redirectTo: `${siteUrl.replace(/\/$/, '')}/set-password`,
      });

      if (inviteErr || !inviteData?.user) {
        return new Response(
          JSON.stringify({ error: inviteErr?.message || 'Failed to generate guardian invitation' }),
          { status: 400, headers: corsHeaders }
        );
      }
      authUserId = inviteData.user.id;
    }

    // Update guardian record with auth user_id and invited_at
    const nowIso = new Date().toISOString();
    await admin
      .from('guardians')
      .update({
        user_id: authUserId,
        invited_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', guardian_id);

    return new Response(
      JSON.stringify({
        success: true,
        user_id: authUserId,
        invited_at: nowIso,
        message: `Invitation successfully dispatched to ${effectiveEmail}.`,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
