import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');

const BANNED_PATTERNS = [
  'admin123',
  'teacher123',
  'TEST_ACCOUNTS',
  'MOCK_USERS',
  'VITE_ENABLE_MOCK_AUTH',
];

let violations = 0;

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Exclude test directory
      if (entry.name === 'test' || entry.name === '__tests__') continue;
      scanDir(fullPath);
    } else if (entry.isFile()) {
      // Exclude test files
      if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) continue;
      if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;

      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const pattern of BANNED_PATTERNS) {
          if (line.includes(pattern)) {
            console.error(`❌ [SECURITY VIOLATION] Banned pattern "${pattern}" found in ${path.relative(rootDir, fullPath)}:${i + 1}`);
            console.error(`   > ${line.trim()}`);
            violations++;
          }
        }
      }
    }
  }
}

console.log('🔍 Running Pre-Deploy Security Audit: Scanning src/ for banned credentials & mock auth...');
scanDir(srcDir);

if (violations > 0) {
  console.error(`\n❌ AUDIT FAILED: ${violations} banned pattern violation(s) found. Rejecting deployment.\n`);
  process.exit(1);
} else {
  console.log('✅ AUDIT PASSED: Zero banned credentials or mock auth patterns detected in production code.\n');
  process.exit(0);
}
