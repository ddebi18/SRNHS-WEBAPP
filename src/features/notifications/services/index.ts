export * from './NotificationAdapter';
export * from './MockNotificationAdapter';

import { mockNotificationAdapter } from './MockNotificationAdapter';
import { NotificationAdapter } from './NotificationAdapter';

/**
 * Returns the active notification adapter for the frontend UI.
 * Real SMS dispatch is handled on-premise by edge_engine via the local Android SMS gateway.
 * The browser UI uses mockNotificationAdapter for audit viewing and simulation.
 */
export const activeNotificationAdapter: NotificationAdapter = mockNotificationAdapter;

