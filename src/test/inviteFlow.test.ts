import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// ────────────────────────────────────────────────────────────
// 1. Invite form validation schema (mirrors FacultyManager)
// ────────────────────────────────────────────────────────────
const inviteSchema = z.object({
  full_name: z.string().trim().min(2, 'Full name is required (min 2 characters)'),
  email: z.string().trim().email('Enter a valid institutional email address'),
});

describe('FacultyManager invite form — Zod validation', () => {
  it('accepts valid name and email', () => {
    const result = inviteSchema.safeParse({ full_name: 'Ms. Torres', email: 'e.torres@srnhs.edu.ph' });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = inviteSchema.safeParse({ full_name: '', email: 'e.torres@srnhs.edu.ph' });
    expect(result.success).toBe(false);
    const issues = (result as z.SafeParseError<unknown>).error.issues;
    expect(issues[0]!.message).toMatch(/required/i);
  });

  it('rejects single-character name', () => {
    const result = inviteSchema.safeParse({ full_name: 'X', email: 'e.torres@srnhs.edu.ph' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = inviteSchema.safeParse({ full_name: 'Ms. Torres', email: 'not-an-email' });
    expect(result.success).toBe(false);
    const issues = (result as z.SafeParseError<unknown>).error.issues;
    expect(issues[0]!.message).toMatch(/email/i);
  });

  it('rejects empty email', () => {
    const result = inviteSchema.safeParse({ full_name: 'Ms. Torres', email: '' });
    expect(result.success).toBe(false);
  });

  it('trims whitespace before validation', () => {
    const result = inviteSchema.safeParse({ full_name: '  Valid Name  ', email: '  valid@email.com  ' });
    expect(result.success).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// 2. Set Password schema (mirrors SetPasswordPage)
// ────────────────────────────────────────────────────────────
const passwordSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm: z.string(),
  })
  .refine(d => d.password === d.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });

describe('SetPasswordPage — password form validation', () => {
  it('accepts matching passwords of 8+ characters', () => {
    const result = passwordSchema.safeParse({ password: 'MyPass1!', confirm: 'MyPass1!' });
    expect(result.success).toBe(true);
  });

  it('rejects password under 8 characters', () => {
    const result = passwordSchema.safeParse({ password: 'short', confirm: 'short' });
    expect(result.success).toBe(false);
    const issues = (result as z.SafeParseError<unknown>).error.issues;
    expect(issues[0]!.message).toMatch(/8/);
  });

  it('rejects mismatched passwords', () => {
    const result = passwordSchema.safeParse({ password: 'MyPass1!', confirm: 'DifferentPass' });
    expect(result.success).toBe(false);
    const issues = (result as z.SafeParseError<unknown>).error.issues;
    expect(issues[0]!.message).toMatch(/match/i);
  });

  it('rejects empty password', () => {
    const result = passwordSchema.safeParse({ password: '', confirm: '' });
    expect(result.success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// 3. ProtectedRoute invite guard logic (unit-tested standalone)
// ────────────────────────────────────────────────────────────

/** Mirrors the guard condition in AppRouter.tsx ProtectedRoute */
function needsSetPassword(user: {
  invited_at?: string | null;
  user_metadata?: Record<string, unknown>;
}): boolean {
  return !!user.invited_at && user.user_metadata?.password_set !== true;
}

describe('ProtectedRoute invite guard', () => {
  it('flags invited user without password_set', () => {
    expect(needsSetPassword({
      invited_at: '2026-09-30T10:00:00Z',
      user_metadata: { full_name: 'New Teacher' },
    })).toBe(true);
  });

  it('does NOT flag user who already set their password', () => {
    expect(needsSetPassword({
      invited_at: '2026-09-30T10:00:00Z',
      user_metadata: { full_name: 'New Teacher', password_set: true },
    })).toBe(false);
  });

  it('does NOT flag admin user with no invited_at', () => {
    expect(needsSetPassword({
      invited_at: null,
      user_metadata: { full_name: 'Admin', role: 'admin' },
    })).toBe(false);
  });

  it('does NOT flag user with undefined invited_at', () => {
    expect(needsSetPassword({
      user_metadata: { full_name: 'Old Teacher', password_set: false },
    })).toBe(false);
  });
});
