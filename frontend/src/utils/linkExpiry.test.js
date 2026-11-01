import { describe, it, expect } from 'vitest';
import { LINK_EXPIRY_OPTIONS, formatLinkExpiry } from './linkExpiry';

describe('password link expiry options', () => {
  it('offers exactly the durations the server accepts, 30 minutes to 7 days', () => {
    expect(LINK_EXPIRY_OPTIONS.map(([minutes]) => minutes)).toEqual([30, 60, 240, 720, 1440, 2880, 4320, 10080]);
  });

  it('formats known values and falls back to minutes', () => {
    expect(formatLinkExpiry(60)).toBe('1 hour');
    expect(formatLinkExpiry(10080)).toBe('7 days');
    expect(formatLinkExpiry(45)).toBe('45 minutes');
  });
});
