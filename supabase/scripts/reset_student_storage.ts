/**
 * supabase/scripts/reset_student_storage.ts
 *
 * Scans and purges student objects from Supabase Storage buckets:
 *   - face-registrations (reference biometric captures)
 *   - student-portraits (CDN roster avatars)
 *   - unidentified-captures (temporary gate face crops)
 *
 * SAFETY:
 *   - DEFAULTS TO DRY RUN: Only lists objects and counts.
 *   - Must pass --confirm to perform actual deletion.
 *   - Never stores or commits keys. Reads exclusively from environment variables:
 *       SUPABASE_URL
 *       SUPABASE_SERVICE_ROLE_KEY
 *
 * How to run (with Deno):
 *   # Dry Run (List files without deleting):
 *   SUPABASE_URL=https://nhbeargdlzcaljndqpzp.supabase.co SUPABASE_SERVICE_ROLE_KEY=your_key \
 *     deno run --allow-env --allow-net supabase/scripts/reset_student_storage.ts
 *
 *   # Actual Deletion:
 *   SUPABASE_URL=https://nhbeargdlzcaljndqpzp.supabase.co SUPABASE_SERVICE_ROLE_KEY=your_key \
 *     deno run --allow-env --allow-net supabase/scripts/reset_student_storage.ts --confirm
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BUCKETS = ['face-registrations', 'student-portraits', 'unidentified-captures'];

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const isConfirm = Deno.args.includes('--confirm');

if (!supabaseUrl || !serviceRoleKey) {
  console.error('\n❌ ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required.');
  console.error('Example:');
  console.error('  SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=sbp_... deno run --allow-env --allow-net supabase/scripts/reset_student_storage.ts\n');
  Deno.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function listAllFiles(bucket: string, prefix = ''): Promise<string[]> {
  const filePaths: string[] = [];
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 100 });

  if (error) {
    if (error.message.includes('not found') || (error as any).statusCode === '404') {
      console.log(`  [i] Bucket '${bucket}' does not exist or has no root.`);
      return [];
    }
    console.warn(`  [!] Warning listing '${bucket}/${prefix}': ${error.message}`);
    return [];
  }

  if (!data) return [];

  for (const item of data) {
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) {
      // It's a folder: recurse into subdirectories
      const subFiles = await listAllFiles(bucket, fullPath);
      filePaths.push(...subFiles);
    } else {
      filePaths.push(fullPath);
    }
  }

  return filePaths;
}

async function main() {
  console.log('================================================================');
  console.log('SRNHS Supabase Storage Cleanup Utility');
  console.log(`Mode: ${isConfirm ? '🚨 LIVE DELETION (--confirm active)' : '🔍 DRY RUN (Preview only)'}`);
  console.log(`Target: ${supabaseUrl}`);
  console.log('================================================================\n');

  let totalObjectsFound = 0;
  let totalObjectsDeleted = 0;

  for (const bucket of BUCKETS) {
    console.log(`Inspecting bucket: '${bucket}'...`);
    const files = await listAllFiles(bucket);
    console.log(`  Found ${files.length} object(s).`);

    if (files.length === 0) continue;

    totalObjectsFound += files.length;
    files.slice(0, 10).forEach(f => console.log(`   - ${f}`));
    if (files.length > 10) console.log(`   ... and ${files.length - 10} more`);

    if (isConfirm) {
      console.log(`  Deleting ${files.length} object(s) from '${bucket}'...`);
      // Delete in batches of 100
      for (let i = 0; i < files.length; i += 100) {
        const batch = files.slice(i, i + 100);
        const { data: delData, error: delErr } = await supabase.storage.from(bucket).remove(batch);
        if (delErr) {
          console.error(`  ❌ Error deleting batch in '${bucket}': ${delErr.message}`);
        } else {
          totalObjectsDeleted += delData?.length || batch.length;
        }
      }
      console.log(`  ✓ Completed deletion for '${bucket}'.\n`);
    } else {
      console.log(`  [DRY RUN] No objects were deleted. Use --confirm to delete.\n`);
    }
  }

  console.log('================================================================');
  console.log(`Summary:`);
  console.log(`  Total student objects found:   ${totalObjectsFound}`);
  console.log(`  Total student objects deleted: ${totalObjectsDeleted}`);
  if (!isConfirm && totalObjectsFound > 0) {
    console.log(`\nTo execute deletion, re-run with --confirm:`);
    console.log(`  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... deno run --allow-env --allow-net supabase/scripts/reset_student_storage.ts --confirm`);
  }
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  Deno.exit(1);
});
