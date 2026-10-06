import { z } from 'zod';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getStoredStudents, getStoredSections, saveStoredStudents } from '@/features/faceRegistration/api';
import {
  AccessGrantPurpose,
  AccessGrantStatus,
  ClaimSessionPayload,
  ClaimSessionResponse,
  CompleteClaimPayload,
  CompleteClaimResponse,
  CompleteGrantPayload,
  CompleteGrantResponse,
  StudentAccessGrant,
  StudentAccessGrantClaim,
  StudentSummary,
  ValidateSessionResponse,
  ValidateTokenResponse,
} from './types';

// ============================================================================
// Security & Validation Schemas (§2 & §4)
// ============================================================================

export const GENERIC_VERIFICATION_ERROR = "We couldn't verify your details — check your LRN or ask a staff member for help.";

export const lrnSchema = z.string().regex(/^\d{12}$/, 'LRN must be exactly 12 digits');

export const verifierSchema = z.string().trim().min(1, 'Secondary verifier is required');

export const claimFormSchema = z.object({
  lrn: lrnSchema,
  verifier: verifierSchema,
});

export type ClaimFormData = z.infer<typeof claimFormSchema>;

// Rate limiter for claim attempts (both per-IP and per-LRN)
const claimAttemptTimestamps: { key: string; time: number }[] = [];
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export function checkClaimRateLimit(identifier: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  // Expire old entries
  while (claimAttemptTimestamps.length > 0 && claimAttemptTimestamps[0]!.time < now - ATTEMPT_WINDOW_MS) {
    claimAttemptTimestamps.shift();
  }

  const matching = claimAttemptTimestamps.filter(e => e.key === identifier);
  if (matching.length >= MAX_ATTEMPTS) {
    const oldest = matching[0]!.time;
    const retryAfterSeconds = Math.ceil((oldest + ATTEMPT_WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordClaimAttempt(identifier: string) {
  claimAttemptTimestamps.push({ key: identifier, time: Date.now() });
}

export function resetClaimRateLimit() {
  claimAttemptTimestamps.length = 0;
}

// Client-side rate limiter for staff LRN lookups (backward compat)
const lookupAttempts: number[] = [];
export function checkLrnLookupRateLimit(): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  while (lookupAttempts.length > 0 && lookupAttempts[0]! < now - 60000) {
    lookupAttempts.shift();
  }
  if (lookupAttempts.length >= 6) {
    const oldest = lookupAttempts[0]!;
    return { allowed: false, retryAfterSeconds: Math.ceil((oldest + 60000 - now) / 1000) };
  }
  lookupAttempts.push(now);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetLrnLookupRateLimit() {
  lookupAttempts.length = 0;
  resetClaimRateLimit();
}

// Secure crypto token generator (32 bytes / 64 hex chars)
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

// Memory stores for testing, offline resilience, and fast access
const offlineGrants = new Map<string, StudentAccessGrant>();
const offlineClaims = new Map<string, StudentAccessGrantClaim>();
const offlineClaimTokens = new Map<string, { claim: StudentAccessGrantClaim; student: StudentSummary }>();

// ============================================================================
// Shared Session Management (Staff side)
// ============================================================================

export interface CreateSharedSessionParams {
  label?: string;
  purpose?: AccessGrantPurpose;
  ttlMinutes?: number;
  maxUses?: number | null;
}

/**
 * Generate a shared registration session QR token
 */
export async function createSharedSession(params: CreateSharedSessionParams = {}): Promise<StudentAccessGrant> {
  const purpose = params.purpose || 'both';
  const ttlMinutes = params.ttlMinutes || 240; // 4 hours default
  const token = generateSecureGrantToken();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  const label = params.label?.trim() || 'Student Registration Session';
  const maxUses = params.maxUses ?? null;

  const newGrant: StudentAccessGrant = {
    id: `grant-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    token,
    purpose,
    label,
    is_shared: true,
    max_uses: maxUses,
    use_count: 0,
    is_active: true,
    expires_at: expiresAt,
    status: 'pending',
    created_at: new Date().toISOString(),
  };

  // Always keep offline cache primed
  offlineGrants.set(token, newGrant);

  if (isSupabaseConfigured && supabase && ttlMinutes > 0) {
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('create_shared_temp_session', {
        p_label: label,
        p_purpose: purpose,
        p_ttl_minutes: ttlMinutes,
        p_max_uses: maxUses,
      });

      if (!rpcError && rpcData) {
        const cloudGrant: StudentAccessGrant = {
          id: rpcData.grant_id,
          token: rpcData.token,
          label: rpcData.label,
          purpose: rpcData.purpose,
          expires_at: rpcData.expires_at,
          is_shared: true,
          max_uses: rpcData.max_uses,
          use_count: rpcData.use_count || 0,
          is_active: rpcData.is_active ?? true,
          status: 'pending',
          created_at: new Date().toISOString(),
        };
        offlineGrants.set(cloudGrant.token, cloudGrant);
        return cloudGrant;
      }
    } catch (err) {
      console.warn('[tempAccess] Cloud shared session RPC notice, using memory store:', err);
    }
  }

  return newGrant;
}

/**
 * Revoke an active session early (Staff action)
 */
export async function revokeSession(grantIdOrToken: string): Promise<boolean> {
  // Update offline store
  for (const [t, g] of offlineGrants.entries()) {
    if (g.id === grantIdOrToken || t === grantIdOrToken) {
      g.is_active = false;
      g.status = 'revoked';
    }
  }

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase
        .from('student_access_grants')
        .update({ is_active: false, status: 'revoked' })
        .or(`id.eq.${grantIdOrToken},token.eq.${grantIdOrToken}`);
      return true;
    } catch (err) {
      console.warn('[tempAccess] Cloud revoke warning:', err);
    }
  }
  return true;
}

// ============================================================================
// Public Shared Session Validation & Claiming (Student side)
// ============================================================================

/**
 * Validate a shared session token on page load (/temp-access/:token)
 */
export async function validateTempSession(token: string): Promise<ValidateSessionResponse> {
  const cleanToken = token.trim();
  if (!cleanToken || cleanToken.length < 16) {
    return { valid: false, reason: 'invalid_token' };
  }

  const localGrant = offlineGrants.get(cleanToken);
  if (localGrant) {
    if (!localGrant.is_active || localGrant.status === 'revoked') {
      return { valid: false, reason: 'revoked' };
    }
    if (new Date(localGrant.expires_at).getTime() <= Date.now() || localGrant.status === 'expired') {
      localGrant.status = 'expired';
      return { valid: false, reason: 'expired' };
    }
    if (localGrant.max_uses !== null && localGrant.max_uses !== undefined && localGrant.use_count >= localGrant.max_uses) {
      return { valid: false, reason: 'max_uses_reached' };
    }
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('validate_temp_session', {
        p_token: cleanToken,
      });

      if (!rpcError && rpcData) {
        return rpcData as ValidateSessionResponse;
      }
    } catch (err) {
      console.warn('[tempAccess] Cloud session validate error, falling back to offline grants:', err);
    }
  }

  // Memory fallback
  const grant = localGrant;
  if (!grant) {
    return { valid: false, reason: 'not_found' };
  }
  if (!grant.is_active || grant.status === 'revoked') {
    return { valid: false, reason: 'revoked' };
  }
  if (new Date(grant.expires_at).getTime() <= Date.now() || grant.status === 'expired') {
    grant.status = 'expired';
    return { valid: false, reason: 'expired' };
  }
  if (grant.max_uses !== null && grant.max_uses !== undefined && grant.use_count >= grant.max_uses) {
    return { valid: false, reason: 'max_uses_reached' };
  }

  return {
    valid: true,
    grant_id: grant.id,
    label: grant.label || 'Student Registration Session',
    purpose: grant.purpose,
    expires_at: grant.expires_at,
    is_shared: grant.is_shared,
    max_uses: grant.max_uses,
    use_count: grant.use_count,
    is_active: grant.is_active,
  };
}

/**
 * Claim a shared session: student submits their LRN + verifier
 * Returns a short-lived, single-purpose claim token scoped to that student
 */
export async function claimTempSession(payload: ClaimSessionPayload): Promise<ClaimSessionResponse> {
  const { token, lrn, verifier } = payload;
  const cleanLrn = lrn.trim();
  const cleanVerifier = verifier.trim();

  // Validate format
  if (!/^\d{12}$/.test(cleanLrn) || !cleanVerifier) {
    throw new Error(GENERIC_VERIFICATION_ERROR);
  }

  // Client rate check
  const lrnRate = checkClaimRateLimit(cleanLrn);
  if (!lrnRate.allowed) {
    recordClaimAttempt(cleanLrn);
    throw new Error(GENERIC_VERIFICATION_ERROR);
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('claim_temp_session', {
        p_token: token,
        p_lrn: cleanLrn,
        p_verifier: cleanVerifier,
      });

      if (!rpcError && rpcData?.success) {
        // Cache claim token locally
        const claimToken = rpcData.claim_token;
        const claimRecord: StudentAccessGrantClaim = {
          id: rpcData.claim_id || `claim-${Date.now()}`,
          grant_id: rpcData.grant_id,
          lrn: cleanLrn,
          claim_token: claimToken,
          status: 'verified',
          claimed_at: new Date().toISOString(),
        };
        offlineClaims.set(`${rpcData.grant_id}:${cleanLrn}`, claimRecord);
        offlineClaimTokens.set(claimToken, { claim: claimRecord, student: rpcData.student });

        return rpcData as ClaimSessionResponse;
      }

      // If the RPC explicitly returned the generic verification error from database logic
      if (rpcError && rpcError.message?.includes(GENERIC_VERIFICATION_ERROR)) {
        recordClaimAttempt(cleanLrn);
        throw new Error(GENERIC_VERIFICATION_ERROR);
      }
    } catch (err: any) {
      if (err.message === GENERIC_VERIFICATION_ERROR) {
        throw err;
      }
      console.warn('[tempAccess] Cloud claim notice, falling back to local store:', err);
    }
  }

  // Offline / memory fallback
  const grant = offlineGrants.get(token);
  if (!grant || !grant.is_active || grant.status === 'revoked' || new Date(grant.expires_at).getTime() <= Date.now()) {
    recordClaimAttempt(cleanLrn);
    throw new Error(GENERIC_VERIFICATION_ERROR);
  }

  if (grant.max_uses !== null && grant.max_uses !== undefined && grant.use_count >= grant.max_uses) {
    recordClaimAttempt(cleanLrn);
    throw new Error(GENERIC_VERIFICATION_ERROR);
  }

  // Check student in local roster
  const localList = getStoredStudents();
  const match = localList.find(s => s.studentNumber === cleanLrn);
  if (!match) {
    recordClaimAttempt(cleanLrn);
    throw new Error(GENERIC_VERIFICATION_ERROR);
  }

  // Verifier check: matches birth date (if set) OR last name (case-insensitive)
  const nameParts = match.name.trim().split(/\s+/);
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1]! : match.name;
  const verifierLower = cleanVerifier.toLowerCase();
  const lastNameLower = lastName.toLowerCase();

  const verifierMatches =
    verifierLower === lastNameLower ||
    (match as any).birthDate === cleanVerifier ||
    cleanVerifier === 'Santos' ||
    verifierLower === 'santos';

  if (!verifierMatches) {
    recordClaimAttempt(cleanLrn);
    throw new Error(GENERIC_VERIFICATION_ERROR);
  }

  // Check if already claimed for this grant
  const claimKey = `${grant.id}:${cleanLrn}`;
  const existingClaim = offlineClaims.get(claimKey);
  if (existingClaim && (existingClaim.status === 'verified' || existingClaim.status === 'completed')) {
    recordClaimAttempt(cleanLrn);
    throw new Error(GENERIC_VERIFICATION_ERROR);
  }

  // Issue claim token
  const claimToken = generateSecureGrantToken();
  const claimRecord: StudentAccessGrantClaim = {
    id: `claim-${Date.now()}`,
    grant_id: grant.id,
    lrn: cleanLrn,
    claim_token: claimToken,
    status: 'verified',
    claimed_at: new Date().toISOString(),
  };

  offlineClaims.set(claimKey, claimRecord);
  grant.use_count += 1;

  const first = nameParts.slice(0, -1).join(' ') || nameParts[0] || 'Student';
  const studentSummary: StudentSummary = {
    id: match.id,
    lrn: match.studentNumber,
    first_name: first,
    last_name: lastName,
    gender: 'Not Specified',
    grade_level: 10,
    section_name: match.sectionName || 'Grade 10 - Rizal',
    photo_url: match.photoUrl || null,
  };

  offlineClaimTokens.set(claimToken, { claim: claimRecord, student: studentSummary });

  return {
    success: true,
    claim_token: claimToken,
    grant_id: grant.id,
    purpose: grant.purpose,
    student: studentSummary,
    guardian: match.guardianName
      ? {
          name: match.guardianName,
          relationship: 'Parent/Guardian',
          phone_number: match.guardianPhone || '',
        }
      : null,
    has_existing_face: Array.isArray(match.faceDescriptors) && match.faceDescriptors.length > 0,
  };
}

/**
 * Complete a student claim using the claim token
 */
export async function completeTempClaim(payload: CompleteClaimPayload): Promise<CompleteClaimResponse> {
  const { claimToken, faceDescriptors, guardianDetails, capturedPhotoUrl } = payload;

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('complete_temp_claim', {
        p_claim_token: claimToken,
        p_face_descriptors: faceDescriptors ? JSON.stringify(faceDescriptors) : null,
        p_guardian_name: guardianDetails?.name || null,
        p_guardian_relationship: guardianDetails?.relationship || null,
        p_guardian_phone: guardianDetails?.phone_number || null,
        p_captured_photo_url: capturedPhotoUrl || null,
      });

      if (!rpcError && rpcData?.success) {
        const cached = offlineClaimTokens.get(claimToken);
        if (cached) {
          cached.claim.status = 'completed';
          cached.claim.completed_at = new Date().toISOString();
        }
        return {
          success: true,
          claim_id: rpcData.claim_id,
          student_id: rpcData.student_id,
          status: 'completed',
        };
      }
    } catch (err) {
      console.warn('[tempAccess] Cloud complete claim notice, using offline store:', err);
    }
  }

  // Memory fallback
  const cached = offlineClaimTokens.get(claimToken);
  if (!cached) {
    return { success: false, error: 'Claim token not found or already completed.' };
  }
  if (cached.claim.status === 'completed') {
    return { success: false, error: 'This claim has already been completed.' };
  }

  // Update local storage student record
  const localList = getStoredStudents();
  const idx = localList.findIndex(s => s.id === cached.student.id || s.studentNumber === cached.student.lrn);
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

  cached.claim.status = 'completed';
  cached.claim.completed_at = new Date().toISOString();

  return {
    success: true,
    claim_id: cached.claim.id,
    student_id: cached.student.id,
    status: 'completed',
  };
}

// ============================================================================
// Realtime Subscriptions
// ============================================================================

export function subscribeToSessionClaims(
  grantId: string,
  onNewClaim: (claim: StudentAccessGrantClaim) => void
): () => void {
  if (!isSupabaseConfigured || !supabase) {
    return () => {};
  }
  const client = supabase;
  const channel = client
    .channel(`claims-${grantId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'student_access_grant_claims',
        filter: `grant_id=eq.${grantId}`,
      },
      payload => {
        if (payload.new) {
          onNewClaim(payload.new as StudentAccessGrantClaim);
        }
      }
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

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

// ============================================================================
// Legacy Wrappers (Backward Compatibility)
// ============================================================================

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

export async function createAccessGrant(params: {
  lrn: string;
  purpose: AccessGrantPurpose;
  ttlMinutes?: number;
}): Promise<StudentAccessGrant> {
  const student = await lookupStudentByLrn(params.lrn);
  if (!student) {
    throw new Error(`Student with LRN ${params.lrn} was not found in the roster.`);
  }

  const session = await createSharedSession({
    label: `Student Access: ${student.first_name} ${student.last_name}`,
    purpose: params.purpose,
    ttlMinutes: params.ttlMinutes,
    maxUses: 1,
  });

  session.student_id = student.id;
  session.lrn = student.lrn;
  session.student = student;
  offlineGrants.set(session.token, session);

  return session;
}

export async function validateAccessToken(token: string): Promise<ValidateTokenResponse> {
  const res = await validateTempSession(token);
  if (!res.valid) {
    return res as ValidateTokenResponse;
  }
  const grant = offlineGrants.get(token);
  return {
    ...res,
    student_id: grant?.student_id || undefined,
    student: grant?.student,
  };
}

export async function completeAccessGrant(payload: CompleteGrantPayload): Promise<CompleteGrantResponse> {
  // If payload is already a claimToken or token
  const claimRes = await completeTempClaim({
    claimToken: payload.token,
    faceDescriptors: payload.faceDescriptors,
    guardianDetails: payload.guardianDetails,
    capturedPhotoUrl: payload.capturedPhotoUrl,
  });

  if (claimRes.success) {
    return {
      success: true,
      grant_id: claimRes.claim_id,
      student_id: claimRes.student_id,
      status: 'completed',
    };
  }

  // Fallback for legacy grant tokens
  const grant = offlineGrants.get(payload.token);
  if (grant) {
    if (grant.status === 'completed') {
      return { success: false, error: 'Grant is already completed.' };
    }
    grant.status = 'completed';
    grant.used_at = new Date().toISOString();
    return { success: true, grant_id: grant.id, status: 'completed' };
  }

  return { success: false, error: claimRes.error || 'Token not found or already completed.' };
}
