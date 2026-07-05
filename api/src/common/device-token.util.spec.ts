import { hashDeviceToken } from './device-token.util';

describe('hashDeviceToken', () => {
  it('is deterministic for the same token and secret', () => {
    const a = hashDeviceToken('abc123', 'pepper');
    const b = hashDeviceToken('abc123', 'pepper');
    expect(a).toBe(b);
  });

  it('produces a different hash for a different secret', () => {
    const a = hashDeviceToken('abc123', 'pepper-1');
    const b = hashDeviceToken('abc123', 'pepper-2');
    expect(a).not.toBe(b);
  });

  it('never returns the plaintext token', () => {
    const hash = hashDeviceToken('abc123', 'pepper');
    expect(hash).not.toContain('abc123');
    expect(hash).toHaveLength(64); // hex-encoded sha256
  });
});
