/**
 * supabase/scripts/create_teachers.ts
 *
 * Creates 3 teacher accounts via the Supabase Admin API.
 * Run with Deno:
 *   SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=sbp_... deno run \
 *     --allow-env --allow-net supabase/scripts/create_teachers.ts
 *
 * Or with ts-node:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx ts-node supabase/scripts/create_teachers.ts
 *
 * NEVER commit the service role key. NEVER use a VITE_ prefix for it.
 * Passwords are printed once to stdout, then discarded.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'; // Deno import — adjust for Node

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are required.');
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Cryptographically random 20-char password. */
function makePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

const TEACHERS = [
  { email: 'teacher1@srnhs.example.test', full_name: 'Teacher One',   department: 'Faculty' },
  { email: 'teacher2@srnhs.example.test', full_name: 'Teacher Two',   department: 'Faculty' },
  { email: 'teacher3@srnhs.example.test', full_name: 'Teacher Three', department: 'Faculty' },
];

console.log('\n=== SRNHS Teacher Account Creation ===\n');

for (const t of TEACHERS) {
  // Check if account already exists by listing users (service role can do this)
  const { data: existing } = await supabase.auth.admin.listUsers();
  const alreadyExists = existing?.users?.some(u => u.email === t.email);

  if (alreadyExists) {
    console.log(`[SKIP] ${t.email} — already exists.`);
    continue;
  }

  const password = makePassword();

  // 1. Create auth user (email already confirmed)
  const { data: created, error: authErr } = await supabase.auth.admin.createUser({
    email: t.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: t.full_name, role: 'teacher' },
  });

  if (authErr || !created?.user) {
    console.error(`[ERROR] ${t.email}: ${authErr?.message}`);
    continue;
  }

  const userId = created.user.id;

  // 2. Insert staff_profiles row (matches how AuthContext reads the role).
  //    role column must be 'teacher' — same as checked in useRole.ts / AuthContext.tsx.
  const { error: profileErr } = await supabase.from('staff_profiles').insert({
    id:          userId,
    email:       t.email,
    full_name:   t.full_name,
    role:        'teacher',
    department:  t.department,
    is_active:   true,
  });

  if (profileErr) {
    console.error(`[ERROR] Profile for ${t.email}: ${profileErr.message}`);
    // Auth user created but profile failed — log it, don't abort
    continue;
  }

  // Print password ONCE. It is never written to a file.
  console.log(`[OK] ${t.email}`);
  console.log(`     Name:     ${t.full_name}`);
  console.log(`     Password: ${password}`);
  console.log(`     User ID:  ${userId}`);
  console.log('');
}

console.log('=== Done. Passwords shown above are not stored anywhere. ===\n');
