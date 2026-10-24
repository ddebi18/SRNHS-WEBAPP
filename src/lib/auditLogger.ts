import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { UserLog } from '@/types/domain.types';

// Blacklisted keys that must never be recorded in audit logs
const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'descriptor',
  'descriptors',
  'face_descriptor',
  'photo',
  'photos',
  'biometrics',
]);

/**
 * Recursively sanitize metadata to ensure no sensitive biometric
 * or credential information is persisted to the audit trail.
 */
export function sanitizeLogMetadata(data: any): any {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizeLogMetadata);

  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      continue; // drop sensitive key entirely
    }
    if (value && typeof value === 'object') {
      clean[key] = sanitizeLogMetadata(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export interface LogActionParams {
  action: string;
  entity_type: string;
  entity_id?: string | null;
  metadata?: Record<string, any>;
  user_id?: string | null;
  role?: string | null;
}

/**
 * Log a user action to the append-only audit trail.
 * Fail-open design: logs errors to console but never throws to caller.
 */
export async function logUserAction(params: LogActionParams): Promise<boolean> {
  const sanitizedMeta = params.metadata ? sanitizeLogMetadata(params.metadata) : {};

  // Resolve current user if not explicitly passed
  let userId = params.user_id || null;
  let userRole = params.role || null;

  try {
    if (!userId && supabase) {
      const { data } = await supabase.auth.getUser();
      userId = data?.user?.id || null;
      userRole = userRole || (data?.user?.user_metadata?.role as string) || null;
    }
  } catch {
    // Non-fatal
  }

  const logEntry: Partial<UserLog> = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    user_id: userId,
    role: userRole || 'system',
    action: params.action,
    entity_type: params.entity_type,
    entity_id: params.entity_id || null,
    metadata: sanitizedMeta,
    created_at: new Date().toISOString(),
  };

  // If Supabase is connected, insert into user_logs table
  if (supabase && isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('user_logs').insert([
        {
          user_id: logEntry.user_id,
          role: logEntry.role,
          action: logEntry.action,
          entity_type: logEntry.entity_type,
          entity_id: logEntry.entity_id,
          metadata: logEntry.metadata,
        },
      ]);
      if (!error) return true;
      console.warn('[AuditLogger] Supabase log insert error:', error.message);
    } catch (err: any) {
      console.warn('[AuditLogger] Network error logging action:', err.message);
    }
  }

  // Fallback to local storage (for testing or offline preview)
  try {
    const existing: UserLog[] = JSON.parse(localStorage.getItem('user_logs') || '[]');
    existing.unshift(logEntry as UserLog);
    // Keep last 1,000 entries in local storage
    if (existing.length > 1000) existing.length = 1000;
    localStorage.setItem('user_logs', JSON.stringify(existing));
    return true;
  } catch (storageErr) {
    console.warn('[AuditLogger] LocalStorage audit write error:', storageErr);
    return false;
  }
}

export interface UserLogFilter {
  user_id?: string;
  role?: string;
  action?: string;
  entity_type?: string;
  start_date?: string;
  end_date?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Fetch logs with filtering and pagination.
 */
export async function fetchUserLogs(filter: UserLogFilter = {}): Promise<{
  data: UserLog[];
  count: number;
}> {
  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;

  if (supabase && isSupabaseConfigured) {
    try {
      let query = supabase
        .from('user_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (filter.user_id) query = query.eq('user_id', filter.user_id);
      if (filter.role) query = query.eq('role', filter.role);
      if (filter.action) query = query.ilike('action', `%${filter.action}%`);
      if (filter.entity_type) query = query.eq('entity_type', filter.entity_type);
      if (filter.start_date) query = query.gte('created_at', filter.start_date);
      if (filter.end_date) query = query.lte('created_at', filter.end_date);

      const { data, count, error } = await query;
      if (!error && data) {
        return { data: data as UserLog[], count: count || data.length };
      }
      console.warn('[AuditLogger] Query error:', error?.message);
    } catch (e) {
      console.warn('[AuditLogger] Fetch failed:', e);
    }
  }

  // Local storage fallback
  try {
    let all: UserLog[] = JSON.parse(localStorage.getItem('user_logs') || '[]');

    if (filter.user_id) all = all.filter(l => l.user_id === filter.user_id);
    if (filter.role) all = all.filter(l => l.role === filter.role);
    if (filter.action) all = all.filter(l => l.action.toLowerCase().includes(filter.action!.toLowerCase()));
    if (filter.entity_type) all = all.filter(l => l.entity_type === filter.entity_type);
    if (filter.start_date) all = all.filter(l => l.created_at >= filter.start_date!);
    if (filter.end_date) all = all.filter(l => l.created_at <= filter.end_date!);
    if (filter.search) {
      const q = filter.search.toLowerCase();
      all = all.filter(
        l =>
          l.action.toLowerCase().includes(q) ||
          l.entity_type.toLowerCase().includes(q) ||
          (l.role && l.role.toLowerCase().includes(q)) ||
          (l.entity_id && l.entity_id.toLowerCase().includes(q))
      );
    }

    const total = all.length;
    const paginated = all.slice(offset, offset + limit);
    return { data: paginated, count: total };
  } catch {
    return { data: [], count: 0 };
  }
}
