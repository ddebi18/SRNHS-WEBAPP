import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

serve(async (req: Request) => {
  // Handle CORS OPTIONS
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

    // 1. Build caller client with request's Authorization header
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

    // 2. Build admin client with SUPABASE_SERVICE_ROLE_KEY
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Look up caller's role; return 403 unless admin
    const { data: callerProfile, error: profileErr } = await admin
      .from('staff_profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single();

    if (profileErr || !callerProfile || callerProfile.role !== 'admin' || !callerProfile.is_active) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: caller is not an active administrator' }),
        { status: 403, headers: corsHeaders }
      );
    }

    // 3. Read and validate { email, full_name } from body
    let body: { email?: string; full_name?: string } = {};
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON request body' }),
        { status: 400, headers: corsHeaders }
      );
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!fullName || !email || !emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Full name and a valid institutional email are required.' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // 4. Invite user by email
    const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, role: 'teacher' },
      redirectTo: `${siteUrl.replace(/\/$/, '')}/set-password`,
    });

    if (inviteErr || !inviteData?.user) {
      return new Response(
        JSON.stringify({ error: inviteErr?.message || 'Failed to send teacher invitation email' }),
        { status: 400, headers: corsHeaders }
      );
    }

    const newUserId = inviteData.user.id;

    // 5. Upsert the profile row into staff_profiles
    const { error: upsertErr } = await admin
      .from('staff_profiles')
      .upsert(
        {
          id: newUserId,
          full_name: fullName,
          email,
          role: 'teacher',
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

    if (upsertErr) {
      return new Response(
        JSON.stringify({ error: `User invited but profile upsert failed: ${upsertErr.message}` }),
        { status: 500, headers: corsHeaders }
      );
    }

    // 6. Return { id }
    return new Response(
      JSON.stringify({ id: newUserId }),
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
