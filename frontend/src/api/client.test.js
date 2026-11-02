import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';

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
