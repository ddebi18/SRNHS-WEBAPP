export type AccessGrantPurpose = 'face_registration' | 'guardian_update' | 'both';

export type AccessGrantStatus = 'pending' | 'completed' | 'expired' | 'revoked';

export type ClaimStatus = 'pending' | 'verified' | 'completed' | 'failed';

export interface StudentSummary {
  id: string;
  lrn: string;
  first_name: string;
  last_name: string;
  gender?: string;
  grade_level?: number;
  section_name?: string;
  photo_url?: string | null;
  birth_date?: string;
}

export interface GuardianDetails {
  name: string;
  relationship: string;
  phone_number: string;
  email?: string;
  address?: string;
}

export interface StudentAccessGrant {
  id: string;
  student_id?: string | null;
  lrn?: string | null;
  token: string;
  purpose: AccessGrantPurpose;
  label?: string | null;
  is_shared: boolean;
  max_uses?: number | null;
  use_count: number;
  is_active: boolean;
  created_by?: string | null;
  expires_at: string;
  status: AccessGrantStatus;
  used_at?: string | null;
  device_meta?: Record<string, unknown> | null;
  created_at: string;
  student?: StudentSummary;
}

export interface StudentAccessGrantClaim {
  id: string;
  grant_id: string;
  lrn: string;
  student_id?: string;
  claim_token: string;
  status: ClaimStatus;
  claimed_at: string;
  completed_at?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
}

export interface ValidateSessionResponse {
  valid: boolean;
  reason?: 'not_found' | 'expired' | 'revoked' | 'max_uses_reached' | 'invalid_token';
  grant_id?: string;
  label?: string | null;
  purpose?: AccessGrantPurpose;
  expires_at?: string;
  is_shared?: boolean;
  max_uses?: number | null;
  use_count?: number;
  is_active?: boolean;
}

// Retain legacy type alias for compatibility
export type ValidateTokenResponse = ValidateSessionResponse & {
  student_id?: string;
  has_existing_face?: boolean;
  student?: StudentSummary;
  guardian?: GuardianDetails | null;
};

export interface ClaimSessionPayload {
  token: string;
  lrn: string;
  verifier: string;
}

export interface ClaimSessionResponse {
  success: boolean;
  claim_token?: string;
  grant_id?: string;
  purpose?: AccessGrantPurpose;
  student?: StudentSummary;
  guardian?: GuardianDetails | null;
  has_existing_face?: boolean;
  error?: string;
}

export interface CompleteClaimPayload {
  claimToken: string;
  faceDescriptors?: number[][];
  guardianDetails?: GuardianDetails;
  capturedPhotoUrl?: string;
}

export interface CompleteClaimResponse {
  success: boolean;
  claim_id?: string;
  student_id?: string;
  status?: ClaimStatus;
  error?: string;
}

// Legacy payload compatibility
export interface CompleteGrantPayload {
  token: string;
  faceDescriptors?: number[][];
  guardianDetails?: GuardianDetails;
  capturedPhotoUrl?: string;
}

export interface CompleteGrantResponse {
  success: boolean;
  grant_id?: string;
  student_id?: string;
  status?: AccessGrantStatus;
  error?: string;
}
