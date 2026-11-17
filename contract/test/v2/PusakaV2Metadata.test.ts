import { describe, expect, it } from 'vitest';
import { checkedDeadline, MAX_CLTV_TIMESTAMP } from '../../scripts/v2/pusaka-v2.js';

describe('Pusaka v2 deadline boundaries', () => {
  it('accepts the last representable deadline and rejects a renewal past the CLTV range', () => {
    expect(checkedDeadline(MAX_CLTV_TIMESTAMP - 512, 512)).toBe(MAX_CLTV_TIMESTAMP);
    expect(() => checkedDeadline(MAX_CLTV_TIMESTAMP - 511, 512)).toThrow(/32-bit/);
    expect(() => checkedDeadline(499_999_999, 512)).toThrow(/32-bit/);
    expect(() => checkedDeadline(1_800_000_000, 0)).toThrow(/32-bit/);
    expect(() => checkedDeadline(1_800_000_000.5, 512)).toThrow(/32-bit/);
  });
});
