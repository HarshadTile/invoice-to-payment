import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadBypass({ mode = 'development', prod = false, flag } = {}) {
  vi.stubEnv('MODE', mode);
  vi.stubEnv('PROD', prod);
  if (flag !== undefined) vi.stubEnv('VITE_DISABLE_AUTH', flag);
  vi.resetModules();
  return (await import('./authSlice')).AUTH_BYPASS;
}

describe('AUTH_BYPASS (skips the login screen)', () => {
  it('works for local development when explicitly switched on', async () => {
    expect(await loadBypass({ flag: 'true' })).toBe(true);
  });

  it('is off unless switched on', async () => {
    expect(await loadBypass({})).toBe(false);
  });

  it('can never be on in a production build, even if the flag is set', async () => {
    expect(await loadBypass({ mode: 'production', prod: true, flag: 'true' })).toBe(false);
  });

  it('is off under test', async () => {
    expect(await loadBypass({ mode: 'test', flag: 'true' })).toBe(false);
  });
});
