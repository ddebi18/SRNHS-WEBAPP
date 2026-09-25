import { z } from 'zod';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getStoredStudents, getStoredSections, saveStoredStudents } from '@/features/faceRegistration/api';
import {
  AccessGrantPurpose,
  AccessGrantStatus,
  CompleteGrantPayload,
  CompleteGrantResponse,
  StudentAccessGrant,
  StudentSummary,
  ValidateTokenResponse,
} from './types';

// ============================================================================
// Security & Rate Limiting
// ============================================================================

export const lrnSchema = z.string().regex(/^\d{12}$/, 'LRN must be exactly 12 digits');

// Client-side rate limiter for LRN lookups to defend against enumeration attacks
const lookupAttempts: number[] = [];
const MAX_LOOKUPS_PER_WINDOW = 6;
const WINDOW_DURATION_MS = 60 * 1000; // 1 minute

export function checkLrnLookupRateLimit(): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  // Filter out timestamps outside the window
  while (lookupAttempts.length > 0 && lookupAttempts[0]! < now - WINDOW_DURATION_MS) {
    lookupAttempts.shift();
  }

  if (lookupAttempts.length >= MAX_LOOKUPS_PER_WINDOW) {
    const oldest = lookupAttempts[0]!;
    const retryAfterSeconds = Math.ceil((oldest + WINDOW_DURATION_MS - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  lookupAttempts.push(now);
  return { allowed: true, retryAfterSeconds: 0 };
}

// Reset rate limiter (primarily for test harness)
export function resetLrnLookupRateLimit() {
  lookupAttempts.length = 0;
}

// Secure crypto token generator (32 bytes base64url-like)
export function generateSecureGrantToken(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buffer = new Uint8Array(32);
    crypto.getRandomValues(buffer);
    return Array.from(buffer, b => b.toString(16).padStart(2, '0')).join('');
  }
  return (
    Math.random().toString(36).substring(2) +
    Math.random().toString(36).substring(2) +
    Math.random().toString(36).substring(2) +
    Math.random().toString(36).substring(2)
  );
}

// Memory-only fallback store for offline evaluation
const offlineGrants = new Map<string, StudentAccessGrant>();

// ============================================================================
// Core API Functions
// ============================================================================

/**
 * Look up a student by DepEd 12-digit LRN with validation and rate-limiting
 */
export async function lookupStudentByLrn(rawLrn: string): Promise<StudentSummary | null> {
  const parseResult = lrnSchema.safeParse(rawLrn.trim());
  if (!parseResult.success) {
    throw new Error(parseResult.error.errors[0]?.message || 'Invalid 12-digit LRN format.');
  }

  const cleanLrn = parseResult.data;

  const rateCheck = checkLrnLookupRateLimit();
  if (!rateCheck.allowed) {
    throw new Error(`Rate limit exceeded. Too many lookups. Please retry in ${rateCheck.retryAfterSeconds}s.`);
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('students')
        .select(`
          id,
          lrn,
          first_name,
          last_name,
          gender,
          grade_level,
          photo_urls,
          sections (
            name
          )
        `)
        .eq('lrn', cleanLrn)
        .maybeSingle();

      if (!error && data) {
        const row = data as any;
        const sectionName = Array.isArray(row.sections)
          ? row.sections[0]?.name
          : row.sections?.name || 'Section Unassigned';

        return {
          id: row.id,
          lrn: row.lrn,
          first_name: row.first_name,
          last_name: row.last_name,
          gender: row.gender,
          grade_level: row.grade_level,
          section_name: sectionName,
          photo_url: Array.isArray(row.photo_urls) && row.photo_urls.length > 0 ? row.photo_urls[0] : null,
        };
      }
    } catch (err) {
      console.warn('[tempAccess] Cloud student lookup error, falling back to local storage:', err);
    }
  }

  // Local fallback
  const localList = getStoredStudents();
  const sections = getStoredSections();
  const match = localList.find(s => s.studentNumber === cleanLrn);
  if (!match) return null;

  const nameParts = match.name.split(' ');
  const first = nameParts.slice(0, -1).join(' ') || nameParts[0] || 'Student';
  const last = nameParts.length > 1 ? nameParts[nameParts.length - 1]! : '';
  const sec = sections.find(s => s.id === match.sectionId);

  return {
    id: match.id,
    lrn: match.studentNumber,
    first_name: first,
    last_name: last,
    gender: 'Not Specified',
    grade_level: sec ? parseInt(sec.gradeLevel.replace('Grade ', ''), 10) || 10 : 10,
    section_name: match.sectionName || sec?.name || 'Grade 10 - Rizal',
    photo_url: match.photoUrl || null,
  };
}

/**
 * Generate a temporary single-use access grant for a student
 */
export async function createAccessGrant(params: {
  lrn: string;
  purpose: AccessGrantPurpose;
  ttlMinutes?: number;
}): Promise<StudentAccessGrant> {
  const student = await lookupStudentByLrn(params.lrn);
  if (!student) {
    throw new Error(`Student with LRN ${params.lrn} was not found in the roster.`);
  }

  const ttlMinutes = params.ttlMinutes || 60; // 1 hour default
  const token = generateSecureGrantToken();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  if (isSupabaseConfigured && supabase) {
    try {
      // First attempt database RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc('create_student_access_grant', {
        p_lrn: student.lrn,
        p_purpose: params.purpose,
        p_ttl_minutes: ttlMinutes,
      });

      if (!rpcError && rpcData) {
        return {
          id: rpcData.grant_id,
          student_id: rpcData.student.id,
          lrn: rpcData.student.lrn,
          token: rpcData.token,
          purpose: rpcData.purpose,
          expires_at: rpcData.expires_at,
          status: 'pending',
          created_at: new Date().toISOString(),
          student: rpcData.student,
        };
      }

      // Fallback: direct table insert if RPC is not yet compiled
      const { data: insertData, error: insertError } = await supabase
        .from('student_access_grants')
        .insert({
          student_id: student.id,
          lrn: student.lrn,
          token,
          purpose: params.purpose,
          expires_at: expiresAt,
          status: 'pending',
        })
        .select()
        .single();

      if (!insertError && insertData) {
        return {
          id: insertData.id,
          student_id: insertData.student_id,
          lrn: insertData.lrn,
          token: insertData.token,
          purpose: insertData.purpose,
          expires_at: insertData.expires_at,
          status: insertData.status as AccessGrantStatus,
          created_at: insertData.created_at,
          student,
        };
      }
    } catch (err) {
      console.warn('[tempAccess] Cloud grant creation warning, using memory fallback:', err);
    }
  }

  // Memory fallback for tests and offline usage
  const mockGrant: StudentAccessGrant = {
    id: `grant-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    student_id: student.id,
    lrn: student.lrn,
    token,
    purpose: params.purpose,
    expires_at: expiresAt,
    status: 'pending',
    created_at: new Date().toISOString(),
    student,
  };
  offlineGrants.set(token, mockGrant);
  return mockGrant;
}

/**
 * Validate an access token from the URL (/temp-access/:token)
 */
export async function validateAccessToken(token: string): Promise<ValidateTokenResponse> {
  const cleanToken = token.trim();
  if (!cleanToken || cleanToken.length < 16) {
    return { valid: false, reason: 'invalid_token' };
  }

  if (isSupabaseConfigured && supabase) {
    try {
      // Attempt database RPC validation
      const { data: rpcData, error: rpcError } = await supabase.rpc('validate_student_access_token', {
        p_token: cleanToken,
      });

      if (!rpcError && rpcData) {
        return rpcData as ValidateTokenResponse;
      }

      // Direct table check fallback
      const { data, error } = await supabase
        .from('student_access_grants')
        .select(`
          id,
          student_id,
          purpose,
          status,
          expires_at,
          students (
            id,
            lrn,
            first_name,
            last_name,
            grade_level,
            photo_urls,
            face_descriptors,
            sections ( name )
          )
        `)
        .eq('token', cleanToken)
        .maybeSingle();

      if (!error && data) {
        const row = data as any;
        if (row.status === 'completed') return { valid: false, reason: 'already_used' };
        if (row.status === 'revoked') return { valid: false, reason: 'revoked' };
        if (row.status === 'expired' || new Date(row.expires_at).getTime() <= Date.now()) {
          return { valid: false, reason: 'expired' };
        }

        const student = row.students;
        const sectionName = Array.isArray(student?.sections)
          ? student.sections[0]?.name
          : student?.sections?.name || 'Section Unassigned';

        return {
          valid: true,
          grant_id: row.id,
          student_id: row.student_id,
          purpose: row.purpose,
          expires_at: row.expires_at,
          has_existing_face: Array.isArray(student?.face_descriptors) && student.face_descriptors.length > 0,
          student: {
            id: student.id,
            lrn: student.lrn,
            first_name: student.first_name,
            last_name: student.last_name,
            grade_level: student.grade_level,
            section_name: sectionName,
            photo_url: Array.isArray(student.photo_urls) && student.photo_urls.length > 0 ? student.photo_urls[0] : null,
          },
        };
      }
    } catch (err) {
      console.warn('[tempAccess] Cloud token validation error, falling back to offline grants:', err);
    }
  }

  // Memory fallback
  const grant = offlineGrants.get(cleanToken);
  if (!grant) {
    return { valid: false, reason: 'not_found' };
  }
  if (grant.status === 'completed') {
    return { valid: false, reason: 'already_used' };
  }
  if (grant.status === 'revoked') {
    return { valid: false, reason: 'revoked' };
  }
  if (new Date(grant.expires_at).getTime() <= Date.now()) {
    grant.status = 'expired';
    return { valid: false, reason: 'expired' };
  }

  return {
    valid: true,
    grant_id: grant.id,
    student_id: grant.student_id,
    purpose: grant.purpose,
    expires_at: grant.expires_at,
    has_existing_face: false,
    student: grant.student,
  };
}

/**
 * Complete a temporary access grant (single-use finalization)
 */
export async function completeAccessGrant(payload: CompleteGrantPayload): Promise<CompleteGrantResponse> {
  const { token, faceDescriptors, guardianDetails, capturedPhotoUrl } = payload;

  if (isSupabaseConfigured && supabase) {
    try {
      // 1. Try RPC completion
      const { data: rpcData, error: rpcError } = await supabase.rpc('complete_student_access_grant', {
        p_token: token,
        p_face_descriptors: faceDescriptors ? JSON.stringify(faceDescriptors) : null,
        p_guardian_name: guardianDetails?.name || null,
        p_guardian_relationship: guardianDetails?.relationship || null,
        p_guardian_phone: guardianDetails?.phone_number || null,
        p_captured_photo_url: capturedPhotoUrl || null,
      });

      if (!rpcError && rpcData?.success) {
        return {
          success: true,
          grant_id: rpcData.grant_id,
          student_id: rpcData.student_id,
          status: 'completed',
        };
      }

      // 2. Direct database updates fallback
      const { data: grant, error: findError } = await supabase
        .from('student_access_grants')
        .select('*')
        .eq('token', token)
        .single();

      if (!findError && grant) {
        if (faceDescriptors) {
          await supabase
            .from('students')
            .update({
              face_descriptors: faceDescriptors,
              face_descriptor_version: 1, // FaceNet model v1
              parent_consent: true,
              consent_date: new Date().toISOString().split('T')[0],
              updated_at: new Date().toISOString(),
            })
            .eq('id', grant.student_id);
        }

        if (guardianDetails) {
          await supabase
            .from('student_guardians')
            .upsert({
              student_id: grant.student_id,
              name: guardianDetails.name,
              relationship: guardianDetails.relationship,
              phone_number: guardianDetails.phone_number,
              is_primary: true,
            });
        }

        await supabase
          .from('student_access_grants')
          .update({
            status: 'completed',
            used_at: new Date().toISOString(),
          })
          .eq('id', grant.id);

        return { success: true, grant_id: grant.id, student_id: grant.student_id, status: 'completed' };
      }
    } catch (err: any) {
      console.warn('[tempAccess] Cloud grant completion notice, falling back:', err);
    }
  }

  // Local/memory fallback
  const grant = offlineGrants.get(token);
  if (!grant) {
    return { success: false, error: 'Grant token not found or already completed.' };
  }
  if (grant.status !== 'pending') {
    return { success: false, error: `Grant is already ${grant.status}.` };
  }

  // Update local storage student record if present
  const localList = getStoredStudents();
  const idx = localList.findIndex(s => s.id === grant.student_id || s.studentNumber === grant.lrn);
  if (idx !== -1) {
    if (faceDescriptors) {
      localList[idx]!.faceDescriptors = faceDescriptors;
      localList[idx]!.faceDescriptorVersion = 1;
      localList[idx]!.faceRegistrationStatus = 'registered';
      localList[idx]!.lastRegisteredAt = new Date().toISOString();
      if (capturedPhotoUrl) {
        localList[idx]!.photoUrl = capturedPhotoUrl;
      }
    }
    if (guardianDetails) {
      localList[idx]!.guardianName = guardianDetails.name;
      localList[idx]!.guardianPhone = guardianDetails.phone_number;
    }
    saveStoredStudents(localList);
  }

  grant.status = 'completed';
  grant.used_at = new Date().toISOString();
  return { success: true, grant_id: grant.id, student_id: grant.student_id, status: 'completed' };
}

/**
 * Subscribe to realtime updates for a grant
 */
export function subscribeToGrantStatus(
  grantId: string,
  onStatusChange: (status: AccessGrantStatus, grant?: any) => void
): () => void {
  if (!isSupabaseConfigured || !supabase) {
    return () => {};
  }

  const client = supabase;
  const channel = client
    .channel(`grant-${grantId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'student_access_grants',
        filter: `id=eq.${grantId}`,
      },
      payload => {
        const updated = payload.new as any;
        if (updated?.status) {
          onStatusChange(updated.status as AccessGrantStatus, updated);
        }
      }
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}
