import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  Violation,
  ViolationType,
  ViolationStatus,
  ViolationView,
} from '@/types/domain.types';
import { violationValidationSchema } from '@/lib/validation';
import { logUserAction } from '@/lib/auditLogger';

const EVIDENCE_BUCKET = 'violation-evidence';
const LS_VIOLATIONS = 'srnhs_violations_v1';
const LS_VIEWS = 'srnhs_violation_views_v1';

export const DEFAULT_VIOLATION_TYPES: ViolationType[] = [
  { id: 'vt-cutting', code: 'cutting_classes', name: 'Cutting Classes / Truancy', description: 'Unauthorized absence from class periods while present in school' },
  { id: 'vt-uniform', code: 'uniform_policy', name: 'DepEd Uniform & Dress Code Non-Compliance', description: 'Violation of standard prescribed DepEd school attire or ID policy' },
  { id: 'vt-tardiness', code: 'tardiness_excessive', name: 'Excessive Tardiness', description: 'Repeated late arrival to campus or classroom sessions' },
  { id: 'vt-loitering', code: 'loitering_hallway', name: 'Hallway Loitering during Class Hours', description: 'Wandering hallways or restricted campus areas while class is in session' },
  { id: 'vt-phone', code: 'phone_usage_prohibited', name: 'Unauthorized Mobile Device Use', description: 'Distracting cell phone usage during instructional time' },
  { id: 'vt-other', code: 'other', name: 'Other Disciplinary Infraction', description: 'Miscellaneous student behavior requiring administrative note' },
];

/**
 * Fetch available infraction / violation types.
 */
export async function fetchViolationTypes(): Promise<ViolationType[]> {
  if (supabase && isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('violation_types')
        .select('*')
        .order('name');

      if (!error && data && data.length > 0) {
        return data as ViolationType[];
      }
    } catch (e) {
      console.warn('[Violations] Types query failed:', e);
    }
  }

  return DEFAULT_VIOLATION_TYPES;
}

/**
 * Upload photo evidence to private storage bucket.
 */
export async function uploadViolationEvidence(file: File): Promise<string> {
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `evidence/${Date.now()}_${cleanName}`;

  if (supabase && isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.storage
        .from(EVIDENCE_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });

      if (!error && data) {
        const { data: pubData } = supabase.storage
          .from(EVIDENCE_BUCKET)
          .getPublicUrl(data.path);
        return pubData?.publicUrl || data.path;
      }
    } catch (err: any) {
      console.warn('[Violations] Evidence upload error:', err.message);
    }
  }

  return typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(file) : `mock://${path}`;
}

export interface FetchViolationsFilter {
  status?: ViolationStatus;
  type_id?: string;
  search?: string;
}

/**
 * Fetch list of violations with student and violation type joined.
 */
export async function fetchViolations(filter: FetchViolationsFilter = {}): Promise<Violation[]> {
  if (supabase && isSupabaseConfigured) {
    try {
      let query = supabase
        .from('violations')
        .select(`
          id,
          student_id,
          violation_type_id,
          section_id,
          school_year_id,
          occurred_at,
          location,
          notes,
          evidence_path,
          status,
          source,
          reported_by,
          created_at,
          students(first_name, last_name, lrn, section_name),
          violation_types(id, name, code),
          staff_profiles(full_name),
          violation_views(count)
        `)
        .order('occurred_at', { ascending: false });

      if (filter.status) query = query.eq('status', filter.status);
      if (filter.type_id) query = query.eq('violation_type_id', filter.type_id);

      const { data, error } = await query;
      if (!error && data) {
        return data.map((row: any) => ({
          id: row.id,
          student_id: row.student_id,
          student_name: row.students ? `${row.students.first_name} ${row.students.last_name}` : undefined,
          student_lrn: row.students?.lrn,
          section_name: row.students?.section_name,
          violation_type_id: row.violation_type_id,
          violation_type_name: row.violation_types?.name,
          violation_type_code: row.violation_types?.code,
          section_id: row.section_id,
          school_year_id: row.school_year_id,
          occurred_at: row.occurred_at,
          location: row.location,
          notes: row.notes,
          evidence_path: row.evidence_path,
          status: row.status,
          source: row.source || 'manual',
          reported_by: row.reported_by,
          reporter_name: row.staff_profiles?.full_name,
          created_at: row.created_at,
          views_count: row.violation_views ? row.violation_views[0]?.count || 0 : 0,
        }));
      }
    } catch (e) {
      console.warn('[Violations] Query error:', e);
    }
  }

  // Local storage fallback
  try {
    let list: Violation[] = JSON.parse(localStorage.getItem(LS_VIOLATIONS) || '[]');
    const views: ViolationView[] = JSON.parse(localStorage.getItem(LS_VIEWS) || '[]');

    if (filter.status) list = list.filter(v => v.status === filter.status);
    if (filter.type_id) list = list.filter(v => v.violation_type_id === filter.type_id);
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        v =>
          v.student_name?.toLowerCase().includes(q) ||
          v.student_lrn?.includes(q) ||
          v.violation_type_name?.toLowerCase().includes(q) ||
          v.notes?.toLowerCase().includes(q)
      );
    }

    return list.map(v => ({
      ...v,
      views_count: views.filter(vw => vw.violation_id === v.id).length,
    }));
  } catch {
    return [];
  }
}

export interface CreateViolationInput {
  student_id: string;
  student_name?: string;
  student_lrn?: string;
  violation_type_id: string;
  section_id?: string | null;
  occurred_at: string;
  location?: string | null;
  notes?: string | null;
  evidence_path?: string | null;
  source?: string;
}

/**
 * Manually report a new student disciplinary infraction.
 */
export async function createViolation(
  input: CreateViolationInput
): Promise<{ success: boolean; data?: Violation; error?: string }> {
  const parsed = violationValidationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message || 'Invalid violation data' };
  }

  const now = new Date().toISOString();
  let reporterId: string | null = null;
  let reporterName = 'Faculty Member';

  if (supabase) {
    try {
      const { data } = await supabase.auth.getUser();
      reporterId = data?.user?.id || null;
      reporterName = data?.user?.user_metadata?.full_name || reporterName;
    } catch {}
  }

  const types = await fetchViolationTypes();
  const matchedType = types.find(t => t.id === input.violation_type_id || t.code === input.violation_type_id);

  if (supabase && isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('violations')
        .insert([
          {
            student_id: input.student_id,
            violation_type_id: input.violation_type_id,
            section_id: input.section_id || null,
            occurred_at: input.occurred_at,
            location: input.location?.trim() || 'Campus',
            notes: input.notes?.trim() || null,
            evidence_path: input.evidence_path || null,
            status: 'reported',
            source: input.source || 'manual',
            reported_by: reporterId,
          },
        ])
        .select(`
          id,
          student_id,
          violation_type_id,
          section_id,
          occurred_at,
          location,
          notes,
          evidence_path,
          status,
          source,
          reported_by,
          created_at,
          students(first_name, last_name, lrn, section_name),
          violation_types(name, code)
        `)
        .single();

      if (error || !data) {
        return { success: false, error: error?.message || 'Failed to submit violation.' };
      }

      logUserAction({
        action: 'violation.create',
        entity_type: 'violation',
        entity_id: data.id,
        metadata: {
          student_id: input.student_id,
          type: matchedType?.name || input.violation_type_id,
          location: input.location,
        },
      }).catch(() => {});

      const stu = (Array.isArray(data.students) ? data.students[0] : data.students) as any;
      const vtype = (Array.isArray(data.violation_types) ? data.violation_types[0] : data.violation_types) as any;

      const createdObj: Violation = {
        id: data.id,
        student_id: data.student_id,
        student_name: stu ? `${stu.first_name} ${stu.last_name}` : input.student_name,
        student_lrn: stu?.lrn || input.student_lrn,
        section_name: stu?.section_name,
        violation_type_id: data.violation_type_id,
        violation_type_name: vtype?.name || matchedType?.name,
        violation_type_code: vtype?.code || matchedType?.code,
        section_id: data.section_id,
        occurred_at: data.occurred_at,
        location: data.location,
        notes: data.notes,
        evidence_path: data.evidence_path,
        status: data.status,
        source: data.source,
        reported_by: data.reported_by,
        reporter_name: reporterName,
        created_at: data.created_at,
        views_count: 0,
      };

      return { success: true, data: createdObj };
    } catch (err: any) {
      return { success: false, error: err.message || 'Submission failed' };
    }
  }

  // Local storage fallback
  const id = `viol-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const localObj: Violation = {
    id,
    student_id: input.student_id,
    student_name: input.student_name || 'Student',
    student_lrn: input.student_lrn || '100000000001',
    violation_type_id: input.violation_type_id,
    violation_type_name: matchedType?.name || 'Infraction',
    violation_type_code: matchedType?.code || 'violation',
    section_id: input.section_id || null,
    occurred_at: input.occurred_at,
    location: input.location?.trim() || 'Campus',
    notes: input.notes?.trim() || null,
    evidence_path: input.evidence_path || null,
    status: 'reported',
    source: input.source || 'manual',
    reported_by: reporterId || 'faculty-01',
    reporter_name: reporterName,
    created_at: now,
    views_count: 0,
  };

  const all: Violation[] = JSON.parse(localStorage.getItem(LS_VIOLATIONS) || '[]');
  all.unshift(localObj);
  localStorage.setItem(LS_VIOLATIONS, JSON.stringify(all));

  logUserAction({
    action: 'violation.create',
    entity_type: 'violation',
    entity_id: id,
    metadata: {
      student_id: input.student_id,
      type: matchedType?.name || input.violation_type_id,
    },
  }).catch(() => {});

  return { success: true, data: localObj };
}

/**
 * Update violation status (e.g. acknowledge or resolve).
 */
export async function updateViolationStatus(
  violationId: string,
  newStatus: ViolationStatus,
  resolutionNotes?: string
): Promise<boolean> {
  if (supabase && isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('violations')
        .update({
          status: newStatus,
          notes: resolutionNotes ? resolutionNotes : undefined,
        })
        .eq('id', violationId);

      if (!error) {
        logUserAction({
          action: `violation.${newStatus}`,
          entity_type: 'violation',
          entity_id: violationId,
          metadata: { new_status: newStatus, resolution_notes: resolutionNotes },
        }).catch(() => {});
        return true;
      }
    } catch (e) {
      console.warn('[Violations] Status update error:', e);
    }
  }

  // Local fallback
  const all: Violation[] = JSON.parse(localStorage.getItem(LS_VIOLATIONS) || '[]');
  const updated = all.map(v => {
    if (v.id === violationId) {
      return {
        ...v,
        status: newStatus,
        notes: resolutionNotes || v.notes,
      };
    }
    return v;
  });
  localStorage.setItem(LS_VIOLATIONS, JSON.stringify(updated));

  logUserAction({
    action: `violation.${newStatus}`,
    entity_type: 'violation',
    entity_id: violationId,
    metadata: { new_status: newStatus },
  }).catch(() => {});

  return true;
}

/**
 * Record a user view of an infraction ("Who Saw It" tracking).
 */
export async function recordViolationView(
  violationId: string,
  user: { id: string; role: string; full_name?: string }
): Promise<void> {
  const now = new Date().toISOString();

  if (supabase && isSupabaseConfigured) {
    try {
      await supabase.from('violation_views').upsert(
        {
          violation_id: violationId,
          user_id: user.id,
          role: user.role,
          last_seen_at: now,
        },
        { onConflict: 'violation_id,user_id' }
      );
      return;
    } catch {}
  }

  // Local fallback
  try {
    const views: ViolationView[] = JSON.parse(localStorage.getItem(LS_VIEWS) || '[]');
    const existing = views.find(v => v.violation_id === violationId && v.user_id === user.id);
    if (existing) {
      existing.last_seen_at = now;
    } else {
      views.push({
        id: `vw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        violation_id: violationId,
        user_id: user.id,
        user_name: user.full_name || 'Staff Member',
        role: user.role,
        first_seen_at: now,
        last_seen_at: now,
      });
    }
    localStorage.setItem(LS_VIEWS, JSON.stringify(views));
  } catch {}
}

/**
 * Fetch who has viewed an infraction.
 */
export async function fetchViolationViews(violationId: string): Promise<ViolationView[]> {
  if (supabase && isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('violation_views')
        .select(`
          id,
          violation_id,
          user_id,
          role,
          first_seen_at,
          last_seen_at,
          staff_profiles(full_name)
        `)
        .eq('violation_id', violationId)
        .order('last_seen_at', { ascending: false });

      if (!error && data) {
        return data.map((r: any) => ({
          id: r.id,
          violation_id: r.violation_id,
          user_id: r.user_id,
          user_name: r.staff_profiles?.full_name || 'Staff Member',
          role: r.role,
          first_seen_at: r.first_seen_at,
          last_seen_at: r.last_seen_at,
        }));
      }
    } catch {}
  }

  const views: ViolationView[] = JSON.parse(localStorage.getItem(LS_VIEWS) || '[]');
  return views.filter(v => v.violation_id === violationId);
}

/**
 * Subscribe to realtime newly reported student infractions.
 */
export function subscribeToViolations(onNewViolation: (violation: Violation) => void): () => void {
  if (!supabase) return () => {};

  const channelId = `violations_live_${Date.now()}`;
  let channel: any = null;

  try {
    channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'violations' },
        payload => {
          fetchViolations().then(list => {
            const hydrated = list.find(v => v.id === payload.new.id);
            if (hydrated) onNewViolation(hydrated);
          });
        }
      )
      .subscribe();
  } catch (e) {
    console.warn('[Violations] Realtime subscription note:', e);
  }

  return () => {
    if (supabase && channel) {
      try {
        supabase.removeChannel(channel);
      } catch {}
    }
  };
}
