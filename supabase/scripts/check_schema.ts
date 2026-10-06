import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nhbeargdlzcaljndqpzp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oYmVhcmdkbHpjYWxqbmRxcHpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NDY2NzksImV4cCI6MjEwMzMyMjY3OX0.FpItIhVrwOGZmm2NG4m1_MYkn_Q6QQm-5jsi2HeN6KE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function maskPhone(phone?: string | null): string {
  if (!phone) return 'none';
  if (phone.length <= 6) return '***';
  return phone.slice(0, 6) + '***' + phone.slice(-4);
}

async function run() {
  console.log('--- 1. Testing sections query ---');
  const { data: sections, error: secErr } = await supabase
    .from('sections')
    .select('id, name, grade_level, adviser_id');
  if (secErr) {
    console.error('sections error:', secErr.message);
  } else {
    console.log(`sections count: ${sections?.length}`);
    console.log('sections sample:', sections?.slice(0, 5));
  }

  console.log('\n--- 2. Testing sections join staff_profiles ---');
  const { data: secJoin, error: secJoinErr } = await supabase
    .from('sections')
    .select('id, name, grade_level, adviser_id, staff_profiles(id, full_name, email)');
  if (secJoinErr) {
    console.error('sections join staff_profiles error:', secJoinErr.message);
  } else {
    console.log('sections join sample:', secJoin?.slice(0, 5));
  }

  console.log('\n--- 3. Testing staff_profiles query ---');
  const { data: staff, error: staffErr } = await supabase
    .from('staff_profiles')
    .select('id, full_name, email, role, is_active');
  if (staffErr) {
    console.error('staff_profiles error:', staffErr.message);
  } else {
    console.log(`staff_profiles count: ${staff?.length}`);
    console.log('staff_profiles sample:', staff?.map(s => ({
      ...s,
      email: s.email ? s.email.replace(/(?<=.).(?=.*@)/g, '*') : ''
    })));
  }

  console.log('\n--- 4. Testing students query ---');
  const { data: students, error: stuErr } = await supabase
    .from('students')
    .select('*')
    .limit(5);
  if (stuErr) {
    console.error('students error:', stuErr.message);
  } else {
    console.log(`students count: ${students?.length}`);
    if (students && students.length > 0) {
      console.log('student keys:', Object.keys(students[0]));
    }
  }

  console.log('\n--- 5. Testing student_guardians query ---');
  const { data: guardians, error: guardErr } = await supabase
    .from('student_guardians')
    .select('*')
    .limit(5);
  if (guardErr) {
    console.error('student_guardians error:', guardErr.message);
  } else {
    console.log(`student_guardians count: ${guardians?.length}`);
    if (guardians && guardians.length > 0) {
      console.log('guardian keys:', Object.keys(guardians[0]));
      console.log('sample guardian (masked):', guardians.map(g => ({
        id: g.id,
        student_id: g.student_id,
        name: g.name,
        relationship: g.relationship,
        phone_number: maskPhone(g.phone_number),
      })));
    }
  }

  console.log('\n--- 6. Testing students join student_guardians ---');
  const { data: stuJoin, error: stuJoinErr } = await supabase
    .from('students')
    .select('id, lrn, first_name, last_name, student_guardians(id, name, relationship, phone_number)')
    .limit(5);
  if (stuJoinErr) {
    console.error('students join student_guardians error:', stuJoinErr.message);
  } else {
    console.log('stuJoin sample (masked):', stuJoin?.map(s => ({
      id: s.id,
      name: `${s.first_name} ${s.last_name}`,
      guardians: (s.student_guardians as any[])?.map(g => ({
        ...g,
        phone_number: maskPhone(g.phone_number),
      })),
    })));
  }
}

run().catch(console.error);
