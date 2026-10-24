import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { activeNotificationAdapter } from './index';
import { SmsNotification } from '@/types/domain.types';
import { getStoredStudents, isValidUUID } from '@/features/faceRegistration/api';
import { normalizePHPhone } from '@/lib/validation';

export const DEFAULT_GATE_SMS_COOLDOWN_SEC = 600; // 10 minutes

// In-memory / session cooldown cache: `${student_id}:${event_type}` -> epoch ms
const cooldownMap = new Map<string, number>();

export function clearGateSmsCooldownCache(): void {
  cooldownMap.clear();
}

/**
 * Formats a short, concise SMS (< 160 chars) compliant with Philippine Telco standards.
 */
export function formatGateSmsMessage(
  studentName: string,
  eventType: 'entry' | 'exit',
  timestamp: Date | string = new Date()
): string {
  const d = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const action = eventType === 'exit' ? 'exited' : 'entered';

  return `[SRNHS] ${studentName} has ${action} San Roque National High School at ${timeStr}.`;
}

/**
 * Retrieves the primary guardian phone number for a student.
 * Prioritizes student_guardians table where is_primary = true,
 * falling back to local student record's guardianPhone / mobile_number.
 */
export async function getPrimaryGuardianPhone(studentId: string): Promise<string | null> {
  if (!studentId) return null;

  // 1. Query Supabase student_guardians if configured
  if (supabase && isSupabaseConfigured && isValidUUID(studentId)) {
    try {
      const { data, error } = await supabase
        .from('student_guardians')
        .select('phone_number, name, is_primary')
        .eq('student_id', studentId)
        .order('is_primary', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0 && data[0]?.phone_number) {
        return normalizePHPhone(data[0].phone_number);
      }
    } catch (err) {
      console.warn('[Gate SMS] Primary guardian fetch note:', err);
    }
  }

  // 2. Fallback to local storage student record
  const students = getStoredStudents();
  const s = students.find((st: any) =>
    st.id === studentId ||
    (st.studentNumber && st.studentNumber === studentId) ||
    (st.lrn && st.lrn === studentId)
  );
  if (s) {
    const rawPhone = s.guardianPhone || (s as any).phone_number || (s as any).mobile_number;
    if (rawPhone && typeof rawPhone === 'string' && rawPhone.trim()) {
      return normalizePHPhone(rawPhone);
    }
  }

  return null;
}

/**
 * Dispatches an automated gate entry/exit SMS alert to the student's primary guardian.
 * Enforces cooldown deduplication and guarantees strict failure isolation.
 */
export async function dispatchGateSms(params: {
  studentId: string;
  studentName: string;
  eventType: 'entry' | 'exit';
  timestamp?: Date | string;
  cooldownSeconds?: number;
}): Promise<{
  dispatched: boolean;
  reason?: string;
  notification?: SmsNotification;
}> {
  const { studentId, studentName, eventType } = params;
  const cooldownSec = params.cooldownSeconds ?? DEFAULT_GATE_SMS_COOLDOWN_SEC;
  const now = Date.now();

  // 1. Cooldown Check (per student + event type)
  const cooldownKey = `${studentId}:${eventType}`;
  const lastDispatched = cooldownMap.get(cooldownKey) || 0;
  if (now - lastDispatched < cooldownSec * 1000) {
    const remainingSec = Math.ceil((cooldownSec * 1000 - (now - lastDispatched)) / 1000);
    return {
      dispatched: false,
      reason: `Cooldown active for ${studentName} (${eventType}): ${remainingSec}s remaining. SMS suppressed.`,
    };
  }

  // 2. Lookup primary guardian phone
  let guardianPhone: string | null = null;
  try {
    guardianPhone = await getPrimaryGuardianPhone(studentId);
  } catch (lookupErr) {
    console.warn('[Gate SMS] Guardian lookup error:', lookupErr);
  }

  if (!guardianPhone) {
    return {
      dispatched: false,
      reason: `No primary guardian phone number registered for student: ${studentName}.`,
    };
  }

  // 3. Format message
  const message = formatGateSmsMessage(studentName, eventType, params.timestamp);
  const smsEventType = eventType === 'exit' ? 'gate_exit' : 'gate_entry';

  // 4. Dispatch with failure isolation (never throws)
  try {
    // Reserve cooldown slot
    cooldownMap.set(cooldownKey, now);

    const notification = await activeNotificationAdapter.sendAlert({
      student_id: studentId,
      student_name: studentName,
      guardian_phone: guardianPhone,
      message,
      event_type: smsEventType,
    });

    return {
      dispatched: true,
      notification,
    };
  } catch (dispatchErr: any) {
    console.warn('[Gate SMS] Dispatch failed (isolated):', dispatchErr);
    return {
      dispatched: false,
      reason: `Dispatch failed: ${dispatchErr?.message || 'Provider error'}`,
    };
  }
}
