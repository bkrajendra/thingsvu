import { createHmac } from 'node:crypto';

export function hashDeviceToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}
