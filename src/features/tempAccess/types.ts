export type AccessGrantPurpose = 'face_registration' | 'guardian_update' | 'both';

export type AccessGrantStatus = 'pending' | 'completed' | 'expired' | 'revoked';

export interface StudentSummary {
  id: string;
  lrn: string;
  first_name: string;
  last_name: string;
  gender?: string;
  grade_level?: number;
  section_name?: string;
  photo_url?: string | null;
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
  student_id: string;
  lrn: string;
  token: string;
  purpose: AccessGrantPurpose;
  created_by?: string | null;
  expires_at: string;
  status: AccessGrantStatus;
  used_at?: string | null;
  device_meta?: Record<string, unknown> | null;
  created_at: string;
  student?: StudentSummary;
}

export interface AccessGrantEvent {
  id: string;
  grant_id: string;
  event_type: 'created' | 'validated' | 'face_captured' | 'guardian_updated' | 'completed' | 'revoked';
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ValidateTokenResponse {
  valid: boolean;
  reason?: 'not_found' | 'expired' | 'already_used' | 'revoked' | 'invalid_token';
  grant_id?: string;
  student_id?: string;
  purpose?: AccessGrantPurpose;
  expires_at?: string;
  has_existing_face?: boolean;
  student?: StudentSummary;
  guardian?: GuardianDetails | null;
}

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
