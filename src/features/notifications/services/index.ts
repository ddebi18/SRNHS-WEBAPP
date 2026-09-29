export * from './NotificationAdapter';
export * from './MockNotificationAdapter';
export * from './supabaseNotificationAdapter';

import { isSupabaseConfigured } from '@/lib/supabase';
import { mockNotificationAdapter } from './MockNotificationAdapter';
import { supabaseNotificationAdapter } from './supabaseNotificationAdapter';
import { NotificationAdapter } from './NotificationAdapter';

/**
 * Returns the active notification adapter for the frontend UI.
 * Real SMS dispatch is logged to Supabase sms_notifications table.
 */
export const activeNotificationAdapter: NotificationAdapter = isSupabaseConfigured
  ? supabaseNotificationAdapter
  : mockNotificationAdapter;

