import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.resetModules();
});

describe('APP_NOW', () => {
  it('stays fixed under test so dates in fixtures are deterministic', async () => {
    const { APP_NOW } = await import('./constants');
    expect(APP_NOW).toBe('2026-09-09');
  });

  it("is the user's real current date in the running app", async () => {
    vi.stubEnv('MODE', 'production');
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 23, 30)); // 15 Oct 2026, late evening local time
    vi.resetModules();
    const { APP_NOW } = await import('./constants');
    expect(APP_NOW).toBe('2026-10-15');
  });
});
