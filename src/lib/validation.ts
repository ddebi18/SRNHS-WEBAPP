/**
 * Database Connectivity & Application Security Helpers
 * Adhering to .antigravity/database connectivity and security rules.md
 */

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
