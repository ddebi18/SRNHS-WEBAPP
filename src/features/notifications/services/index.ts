export * from './NotificationAdapter';
export * from './MockNotificationAdapter';
export * from './PhilSmsAdapter';
export * from './AndroidSmsGatewayAdapter';

import { mockNotificationAdapter } from './MockNotificationAdapter';
import { philSmsAdapter } from './PhilSmsAdapter';
import { androidSmsGatewayAdapter } from './AndroidSmsGatewayAdapter';
import { NotificationAdapter } from './NotificationAdapter';

/**
 * Active notification adapter — selected automatically based on env vars:
 *
 *  VITE_ANDROID_GATEWAY_URL set  →  AndroidSmsGatewayAdapter  (free, your phone)
 *  VITE_PHILSMS_API_TOKEN set    →  PhilSmsAdapter             (paid PH gateway)
 *  Neither set                   →  MockNotificationAdapter    (dev/simulation)
 */
export const activeNotificationAdapter: NotificationAdapter =
  import.meta.env.VITE_ANDROID_GATEWAY_URL
    ? androidSmsGatewayAdapter
    : import.meta.env.VITE_PHILSMS_API_TOKEN
    ? philSmsAdapter
    : mockNotificationAdapter;
