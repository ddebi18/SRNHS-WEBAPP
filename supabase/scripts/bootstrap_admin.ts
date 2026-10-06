/**
 * supabase/scripts/bootstrap_admin.ts
 *
 * Safe, idempotent administrator provisioning via official Supabase Admin API.
 * NEVER writes raw SQL to auth tables.
 *
 * Usage:
 *   # Dry run (inspect only, no changes):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node supabase/scripts/bootstrap_admin.ts
 *
 *   # Apply changes:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node supabase/scripts/bootstrap_admin.ts --confirm
 *
 *   # Verify / inspect teacher account:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/scripts/bootstrap_admin.ts --teacher
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

const isConfirm = process.argv.includes('--confirm');
const isResetPassword = process.argv.includes('--reset-password');
const isTeacherMode = process.argv.includes('--teacher');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('\n❌ ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required.');
  console.error('Example:');
  console.error('  SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=sbp_... node supabase/scripts/bootstrap_admin.ts --confirm\n');
  process.exit(1);
}

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function generateSecurePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
  const bytes = crypto.randomBytes(24);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

function maskEmail(email: string): string {
  if (!email) return '***';
  const parts = email.split('@');
  if (parts.length < 2) return '***';
  const user = parts[0];
  const domain = parts[1];
  const maskedUser = user.length > 2 ? user[0] + '***' + user.slice(-1) : user[0] + '***';
  return `${maskedUser}@${domain}`;
}

async function verifyWithAnonKey(email: string, pass: string, expectedRole: string) {
  if (!ANON_KEY) {
    console.log('ℹ️  Skipping client verification (VITE_SUPABASE_ANON_KEY not provided).');
    return;
  }

  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: authData, error: authErr } = await anonClient.auth.signInWithPassword({
    email,
    password: pass,
  });

  if (authErr || !authData.user) {
    console.log(`❌ Verification: Sign-in FAIL (${authErr?.message || 'No user session'})`);
    return;
  }

  const { data: profile, error: profErr } = await anonClient
    .from('staff_profiles')
    .select('id, email, role, is_active')
    .eq('id', authData.user.id)
    .single();

  if (profErr || !profile) {
    console.log(`❌ Verification: RLS Own-Profile Read FAIL (${profErr?.message || 'Profile missing'})`);
    return;
  }

  if (profile.role === expectedRole && profile.is_active) {
    console.log(`✅ Verification: PASS (Signed in, RLS own-row read verified, role = '${expectedRole}')`);
  } else {
    console.log(`❌ Verification: FAIL (Role mismatch or inactive: role = '${profile.role}')`);
  }
}

async function runTeacherCheck() {
  console.log('\n=== Verifying Teacher Account ===\n');
  const { data: users, error } = await adminClient.auth.admin.listUsers();
  if (error) {
    console.error('Failed to list users:', error.message);
    process.exit(1);
  }

  const { data: teacherProfiles } = await adminClient
    .from('staff_profiles')
    .select('*')
    .eq('role', 'teacher');

  console.log(`Found ${teacherProfiles?.length || 0} teacher profile(s) in staff_profiles:`);
  for (const prof of teacherProfiles || []) {
    const authUser = users.users.find(u => u.id === prof.id || u.email === prof.email);
    const hasIdentity = authUser?.identities && authUser.identities.length > 0;
    console.log(`- ${maskEmail(prof.email)} (ID: ${prof.id.slice(0, 8)}...):`);
    console.log(`  Staff Profile: active=${prof.is_active}, role=${prof.role}`);
    console.log(`  Auth User:     exists=${!!authUser}, confirmed=${!!authUser?.email_confirmed_at}, identity=${hasIdentity ? 'OK' : 'MISSING'}`);
  }
  console.log('\n=== Teacher Check Complete ===\n');
}

async function runBootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL || 'dave.rentoria18@gmail.com';
  let password = process.env.ADMIN_PASSWORD;
  let passwordWasGenerated = false;

  if (!password) {
    password = generateSecurePassword();
    passwordWasGenerated = true;
  }

  console.log('\n=== SRNHS Safe Admin Account Bootstrap ===\n');
  console.log(`Target Email: ${maskEmail(email)}`);
  console.log(`Mode:         ${isConfirm ? '🔴 APPLYING CHANGES (--confirm)' : '🟡 DRY RUN (no changes applied)'}\n`);

  // 1. Check existing Auth user
  const { data: userList, error: listErr } = await adminClient.auth.admin.listUsers();
  if (listErr) {
    console.error('❌ Failed to query auth users:', listErr.message);
    process.exit(1);
  }

  const existingAuthUser = userList.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
  let targetUserId: string | null = existingAuthUser?.id || null;
  let needsRecreation = false;

  if (existingAuthUser) {
    const hasIdentity = existingAuthUser.identities && existingAuthUser.identities.length > 0;
    console.log(`Found existing auth record (ID: ${existingAuthUser.id.slice(0, 8)}...)`);
    console.log(`- Confirmed:  ${!!existingAuthUser.email_confirmed_at}`);
    console.log(`- Identities: ${hasIdentity ? 'Present' : 'MISSING (Broken)'}`);

    if (!hasIdentity || !existingAuthUser.email_confirmed_at) {
      console.log('⚠️  Existing auth user is broken (missing identity or unconfirmed). Needs clean recreation.');
      needsRecreation = true;
    }
  } else {
    console.log('No existing auth user found for this email.');
    needsRecreation = true;
  }

  if (!isConfirm) {
    console.log('\n[DRY RUN SUMMARY]:');
    if (needsRecreation) {
      console.log(`- Would ${existingAuthUser ? 'delete broken and ' : ''}create auth user via auth.admin.createUser`);
    } else if (isResetPassword) {
      console.log('- Would update existing auth user password via auth.admin.updateUserById');
    }
    console.log(`- Would upsert public.staff_profiles row with role = 'admin', is_active = true`);
    console.log('\nTo execute, re-run with --confirm flag.');
    return;
  }

  // 2. Perform safe Auth operations
  if (needsRecreation) {
    if (existingAuthUser) {
      console.log('Deleting broken auth record...');
      await adminClient.auth.admin.deleteUser(existingAuthUser.id);
    }

    console.log('Creating fresh auth user via official Admin API...');
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'admin' },
    });

    if (createErr || !created.user) {
      console.error('❌ Failed to create auth user:', createErr?.message);
      process.exit(1);
    }

    targetUserId = created.user.id;
    console.log(`✅ Auth user created successfully with ID: ${targetUserId}`);
  } else if (isResetPassword) {
    console.log('Updating password for existing healthy auth user...');
    const { error: updateErr } = await adminClient.auth.admin.updateUserById(targetUserId!, {
      password,
    });
    if (updateErr) {
      console.error('❌ Failed to update password:', updateErr.message);
      process.exit(1);
    }
    console.log('✅ Password updated successfully.');
  }

  // 3. Upsert staff_profiles row matching targetUserId
  console.log('Upserting public.staff_profiles record...');
  const { error: profileErr } = await adminClient.from('staff_profiles').upsert(
    {
      id: targetUserId,
      email: email.toLowerCase(),
      full_name: 'Administrator',
      role: 'admin',
      department: 'Office of the Principal',
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (profileErr) {
    console.error('❌ Failed to upsert staff_profiles:', profileErr.message);
    process.exit(1);
  }
  console.log('✅ staff_profiles record successfully linked and active.');

  // Print generated password once if generated
  if (passwordWasGenerated) {
    console.log('\n' + '='.repeat(50));
    console.log('🔐 Generated Password (NOT STORED, PRINTED ONCE):');
    console.log(`   ${password}`);
    console.log('='.repeat(50) + '\n');
  }

  // 4. Verify via anon key
  await verifyWithAnonKey(email, password, 'admin');

  console.log('\n=== Done. Admin account is ready for sign-in. ===\n');
}

if (isTeacherMode) {
  runTeacherCheck();
} else {
  runBootstrapAdmin();
}
