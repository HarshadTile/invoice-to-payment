import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, SESSION_ENDED_EVENT } from './client';

afterEach(() => { vi.unstubAllGlobals(); api.clearToken(); });

describe('API client file downloads', () => {
  it('fetches a file with the sign-in token and returns it as a blob', async () => {
    const fetch = vi.fn(async () => new Response('a,b\n1,2', { status: 200, headers: { 'Content-Type': 'text/csv' } }));
    vi.stubGlobal('fetch', fetch);
    api.setToken('secret-token');
    const blob = await api.getBlob('/v1/invoices/export?channel=all');
    expect(await blob.text()).toBe('a,b\n1,2');
    expect(fetch).toHaveBeenCalledWith('/api/v1/invoices/export?channel=all', expect.objectContaining({
      method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer secret-token' }) }));
  });

  it('turns a failed download into an error with the server\'s message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Export is not allowed' } }), { status: 403 })));
    await expect(api.getBlob('/v1/invoices/export')).rejects.toMatchObject({ status: 403, message: 'Export is not allowed' });
  });
});

describe('API client when the server ends the session', () => {
  const reply = (status, message) => vi.fn(async () => new Response(JSON.stringify({ error: { message } }), { status }));
  const listen = () => {
    const seen = [];
    const on = (e) => seen.push(e.detail.message);
    window.addEventListener(SESSION_ENDED_EVENT, on);
    return { seen, stop: () => window.removeEventListener(SESSION_ENDED_EVENT, on) };
  };

  it('forgets the token and announces it on a 401 mid-session', async () => {
    const { seen, stop } = listen();
    vi.stubGlobal('fetch', reply(401, 'Your session has ended. Please sign in again.'));
    api.setToken('old-token');
    await expect(api.get('/v1/invoices/list-invoices')).rejects.toMatchObject({ status: 401 });
    expect(api.hasToken()).toBe(false);
    expect(seen).toEqual(['Your session has ended. Please sign in again.']);
    stop();
  });

  it('treats deactivation and a changed workspace as the end of the session', async () => {
    const { seen, stop } = listen();
    for (const message of ['This account has been deactivated.', 'Workspace access is no longer authorised.']) {
      vi.stubGlobal('fetch', reply(403, message));
      api.setToken('old-token');
      await expect(api.get('/v1/invoices/dashboard')).rejects.toMatchObject({ status: 403 });
    }
    expect(seen).toEqual(['This account has been deactivated. Contact an administrator.',
      'Your access to this workspace has changed. Please sign in again.']);
    stop();
  });

  it('keeps the session for an ordinary 403 and for a wrong password at sign-in', async () => {
    const { seen, stop } = listen();
    api.setToken('good-token');
    vi.stubGlobal('fetch', reply(403, 'You cannot assign this ticket.'));
    await expect(api.post('/v1/tickets/1/assign-ticket', {})).rejects.toMatchObject({ status: 403 });
    vi.stubGlobal('fetch', reply(401, 'Invalid username or password.'));
    await expect(api.post('/v1/auth/login', {})).rejects.toMatchObject({ status: 401 });
    expect(api.hasToken()).toBe(true);
    expect(seen).toEqual([]);
    stop();
  });
});
