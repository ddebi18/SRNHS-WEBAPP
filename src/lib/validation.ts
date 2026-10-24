/**
 * Database Connectivity & Application Security Helpers
 * Adhering to .antigravity/database connectivity and security rules.md
 */
import { z } from 'zod';

// ─── Rule 1: Input Validation & Sanitization ─────────────────────────────────

/**
 * Validates Philippine Learner Reference Number (LRN) — strictly 12 digits
 */
export function isValidLRN(lrn: string): boolean {
  return /^\d{12}$/.test(lrn.trim());
}

/**
 * Validates Philippine Mobile Phone (+639XXXXXXXXX or 09XXXXXXXXX)
 */
export function isValidPHPhone(phone: string): boolean {
  const cleaned = phone.trim().replace(/\s+/g, '');
  return /^(\+639\d{9}|09\d{9})$/.test(cleaned);
}

/**
 * Normalizes Philippine Mobile Phone to standard E.164 (+639XXXXXXXXX)
 */
export function normalizePHPhone(phone: string): string {
  const cleaned = phone.trim().replace(/[\s-()]/g, '');
  if (cleaned.startsWith('09')) {
    return `+63${cleaned.slice(1)}`;
  }
  if (cleaned.startsWith('9')) {
    return `+63${cleaned}`;
  }
  return cleaned;
}

/**
 * Validates standard institutional email format
 */
export function isValidEmail(email: string): boolean {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim());
}

/**
 * Sanitizes generic string input by stripping dangerous control characters and trimming
 */
export function sanitizeInput(input: string, maxLength = 255): string {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    // Strip null bytes and non-printable control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, maxLength);
}

// ─── Rule 8: Generic Safe Error Messaging ────────────────────────────────────

/**
 * Maps database/network error objects to generic, safe user-facing error messages
 * without leaking internal database schema, SQL syntax, or server stack traces.
 */
export function getSafeErrorMessage(error: unknown, fallbackMessage = 'An unexpected error occurred. Please try again.'): string {
  if (!error) return fallbackMessage;

  const rawMessage = typeof error === 'object' && error !== null && 'message' in error
    ? String((error as any).message).toLowerCase()
    : String(error).toLowerCase();

  // Known harmless user-correctable errors
  if (rawMessage.includes('invalid login credentials') || rawMessage.includes('invalid credentials')) {
    return 'Invalid email or password. Please verify your credentials and try again.';
  }
  if (rawMessage.includes('email not confirmed')) {
    return 'Please confirm your email address before signing in.';
  }
  if (rawMessage.includes('rate limit') || rawMessage.includes('too many requests')) {
    return 'Too many login attempts. Please wait a few moments before trying again.';
  }
  if (rawMessage.includes('unique constraint') || rawMessage.includes('duplicate key')) {
    return 'A record with this identifier (LRN, code, or email) already exists.';
  }
  if (rawMessage.includes('network') || rawMessage.includes('failed to fetch')) {
    return 'Unable to reach the database server. Please check your internet connection.';
  }

  // Never leak internal table/column names or SQL queries
  return fallbackMessage;
}

// ─── Rule 10: Client-Side Rate Limiter for Login Protection ──────────────────

interface RateLimitState {
  attempts: number;
  lockoutUntil: number;
}

const RATE_LIMIT_STORAGE_KEY = 'srnhs_auth_rate_limit';
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60_000; // 60 seconds lockout after 5 consecutive failures

export function checkLoginRateLimit(): { isLocked: boolean; remainingSeconds: number } {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_STORAGE_KEY);
    if (!raw) return { isLocked: false, remainingSeconds: 0 };

    const state: RateLimitState = JSON.parse(raw);
    const now = Date.now();

    if (state.lockoutUntil > now) {
      const remainingSeconds = Math.ceil((state.lockoutUntil - now) / 1000);
      return { isLocked: true, remainingSeconds };
    }

    // Lockout expired, reset if needed
    if (state.lockoutUntil <= now && state.attempts >= MAX_ATTEMPTS) {
      localStorage.removeItem(RATE_LIMIT_STORAGE_KEY);
    }
  } catch {
    // Ignore storage parse errors
  }
  return { isLocked: false, remainingSeconds: 0 };
}

export function recordFailedLoginAttempt(): { isLocked: boolean; remainingSeconds: number } {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_STORAGE_KEY);
    const state: RateLimitState = raw ? JSON.parse(raw) : { attempts: 0, lockoutUntil: 0 };

    state.attempts += 1;
    if (state.attempts >= MAX_ATTEMPTS) {
      state.lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
      localStorage.setItem(RATE_LIMIT_STORAGE_KEY, JSON.stringify(state));
      return { isLocked: true, remainingSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000) };
    }

    localStorage.setItem(RATE_LIMIT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
  return { isLocked: false, remainingSeconds: 0 };
}

export function resetLoginRateLimit(): void {
  try {
    localStorage.removeItem(RATE_LIMIT_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

// ─── Rule 11: Student Profile & Guardian Zod Validation Schemas ──────────────

export const guardianValidationSchema = z.object({
  id: z.string().optional(),
  full_name: z.string().min(1, 'Guardian full name is required').max(100),
  relationship: z.string().min(1, 'Relationship is required').max(50),
  mobile_number: z.string().refine(isValidPHPhone, {
    message: 'Mobile number must be a valid PH mobile number (e.g. 09171234567 or +639171234567)',
  }),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  address: z.string().max(255).optional().or(z.literal('')),
  is_primary: z.boolean().default(false),
});

export const studentProfileSchema = z.object({
  lrn: z.string().refine(isValidLRN, {
    message: 'LRN must be exactly 12 numeric digits',
  }),
  first_name: z.string().min(1, 'First name is required').max(50),
  middle_name: z.string().max(50).optional().or(z.literal('')),
  last_name: z.string().min(1, 'Last name is required').max(50),
  suffix: z.string().max(20).optional().or(z.literal('')),
  birthdate: z.string().min(1, 'Birth date is required').refine(val => !isNaN(Date.parse(val)), {
    message: 'Invalid birth date format',
  }),
  sex: z.enum(['Male', 'Female', 'Other'], {
    errorMap: () => ({ message: 'Sex must be Male, Female, or Other' }),
  }),
  religion: z.string().max(50).optional().or(z.literal('')),
  mother_tongue: z.string().max(50).optional().or(z.literal('')),
  ethnic_group: z.string().max(50).optional().or(z.literal('')),
  is_pwd: z.boolean().default(false),
  is_4ps: z.boolean().default(false),
  house_street: z.string().max(100).optional().or(z.literal('')),
  barangay: z.string().min(1, 'Barangay is required').max(100),
  city_municipality: z.string().min(1, 'City/Municipality is required').max(100),
  province: z.string().min(1, 'Province is required').max(100),
  zip_code: z.string().max(10).optional().or(z.literal('')),
  prev_school_name: z.string().max(100).optional().or(z.literal('')),
  prev_grade_level: z.number().int().min(1).max(12).optional().nullable(),
  prev_general_average: z.number().min(60).max(100).optional().nullable(),
  school_year_admitted: z.string().max(30).optional().or(z.literal('')),
  grade_level: z.number().int().min(7).max(12),
  section_id: z.string().min(1, 'Section selection is required'),
  guardians: z.array(guardianValidationSchema).min(2, 'Every student must have at least two guardians').refine(
    list => list.filter(g => g.is_primary).length === 1,
    { message: 'Exactly one primary guardian must be designated' }
  ),
});

export type StudentProfileInput = z.infer<typeof studentProfileSchema>;
export type GuardianInput = z.infer<typeof guardianValidationSchema>;

/**
 * Checks if a student record has at least two guardians.
 * Used to conditionally render the "Incomplete Guardians (< 2)" badge on legacy records.
 */
export function hasMinimumGuardians(guardians?: Array<{ id?: string; full_name?: string }> | null): boolean {
  return Array.isArray(guardians) && guardians.length >= 2;
}

/**
 * Checks if an existing student has a complete profile according to DepEd requirements.
 * Used to conditionally render the "Incomplete Profile" badge on legacy students.
 */
export function isProfileComplete(student: {
  lrn?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  birthdate?: string | null;
  sex?: string | null;
  gender?: string | null;
  barangay?: string | null;
  city_municipality?: string | null;
  province?: string | null;
}): boolean {
  if (!student.lrn || !isValidLRN(student.lrn)) return false;
  if (!student.first_name?.trim() || !student.last_name?.trim()) return false;
  if (!student.birthdate?.trim()) return false;
  const sex = student.sex || (student.gender !== 'Not Specified' ? student.gender : null);
  if (!sex?.trim()) return false;
  if (!student.barangay?.trim() || !student.city_municipality?.trim() || !student.province?.trim()) return false;
  return true;
}

// ─── Faculty Features Validation Schemas ────────────────────────────────────

export const gradeValidationSchema = z.object({
  student_id: z.string().min(1, 'Student is required'),
  subject_id: z.string().min(1, 'Subject is required'),
  section_id: z.string().min(1, 'Section is required'),
  quarter: z.number().int().min(1).max(4),
  grade: z.number().min(60, 'Minimum DepEd grade floor is 60').max(100, 'Maximum grade ceiling is 100'),
  is_published: z.boolean().default(false),
});

export type GradeInput = z.infer<typeof gradeValidationSchema>;

export const eventValidationSchema = z.object({
  title: z.string().min(2, 'Event title must be at least 2 characters').max(150),
  description: z.string().max(500).optional().or(z.literal('')),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  start_time: z.string().optional().or(z.literal('')),
  end_time: z.string().optional().or(z.literal('')),
  venue: z.string().max(100).optional().or(z.literal('')),
  status: z.enum(['upcoming', 'ongoing', 'completed', 'cancelled']).default('upcoming'),
});

export type EventInput = z.infer<typeof eventValidationSchema>;

// ─── Announcements Validation Schemas ────────────────────────────────────────

export const announcementValidationSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(150),
  body: z.string().min(5, 'Announcement body must be at least 5 characters'),
  audience_type: z.enum(['school', 'grade_level', 'section']),
  audience_id: z.string().optional().nullable().or(z.literal('')),
  send_sms: z.boolean().default(false),
}).refine(data => {
  if (data.audience_type !== 'school') {
    return Boolean(data.audience_id && data.audience_id.trim());
  }
  return true;
}, {
  message: 'Audience ID is required when targeting a grade level or section',
  path: ['audience_id'],
});

export type AnnouncementInput = z.infer<typeof announcementValidationSchema>;

// ─── Violations Validation Schemas ──────────────────────────────────────────

export const violationValidationSchema = z.object({
  student_id: z.string().min(1, 'Student selection is required'),
  violation_type_id: z.string().min(1, 'Violation type is required'),
  section_id: z.string().optional().or(z.literal('')),
  occurred_at: z.string().min(1, 'Date and time of infraction are required'),
  location: z.string().max(100).optional().or(z.literal('')),
  notes: z.string().max(500).optional().or(z.literal('')),
  status: z.enum(['reported', 'acknowledged', 'resolved']).default('reported'),
});

export type ViolationInput = z.infer<typeof violationValidationSchema>;


