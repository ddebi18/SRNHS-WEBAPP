export * from './NotificationAdapter';
export * from './MockNotificationAdapter';
export * from './PhilSmsAdapter';

import { mockNotificationAdapter } from './MockNotificationAdapter';
import { philSmsAdapter } from './PhilSmsAdapter';
import { NotificationAdapter } from './NotificationAdapter';

/**
 * Returns the active notification adapter.
 * Uses PhilSMS if VITE_PHILSMS_API_TOKEN is configured; otherwise uses mock adapter for offline dev.
 */
export const activeNotificationAdapter: NotificationAdapter =
  import.meta.env.VITE_PHILSMS_API_TOKEN
    ? philSmsAdapter
    : mockNotificationAdapter;
