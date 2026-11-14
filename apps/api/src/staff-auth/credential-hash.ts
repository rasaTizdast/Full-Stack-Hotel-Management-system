import { createHash, timingSafeEqual } from 'node:crypto';

export function hashCredential(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function constantTimeEqual(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) {
    return false;
  }

  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
