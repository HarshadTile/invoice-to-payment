import { afterEach, describe, expect, it, vi } from 'vitest';
import { invoiceApi } from './invoiceApi';

const pageResult = (page, total = 8) => ({ total_pages: total, items: [{ invoice_number: `INV-${page}` }] });
afterEach(() => vi.restoreAllMocks());

describe('invoice page loading', () => {
  it('bounds requests, forwards scope, and keeps row order when pages arrive out of order', async () => {
    const releases = new Map();
    let active = 0;
    let maximum = 0;
    const list = vi.spyOn(invoiceApi, 'list').mockImplementation(({ page }) => {
      if (page === 1) return Promise.resolve(pageResult(page));
      active += 1;
      maximum = Math.max(maximum, active);
      const response = page <= 5 ? new Promise((resolve) => releases.set(page, resolve)) : Promise.resolve(pageResult(page));
      return response.then((result) => { active -= 1; return result; });
    });
    const loading = invoiceApi.listAll({ vendor_code: 'V1', channel: 'poPortal' });
    await vi.waitFor(() => expect(releases.size).toBe(4));
    expect(list).toHaveBeenCalledTimes(5);
    for (const page of [5, 4, 3, 2]) releases.get(page)(pageResult(page));
    expect((await loading).map((i) => i.no)).toEqual(Array.from({ length: 8 }, (_, i) => `INV-${i + 1}`));
    expect(maximum).toBeLessThanOrEqual(4);
    expect(list.mock.calls.every(([params]) => params.vendor_code === 'V1' && params.channel === 'poPortal')).toBe(true);
  });

  it('does not return partial invoices or schedule more pages after an error', async () => {
    const list = vi.spyOn(invoiceApi, 'list').mockImplementation(({ page }) => page === 1
      ? Promise.resolve(pageResult(page)) : Promise.reject(new Error('Session ended')));
    await expect(invoiceApi.listAll()).rejects.toThrow('Session ended');
    expect(list.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it('handles a supplier with no invoices without requesting further pages', async () => {
    const list = vi.spyOn(invoiceApi, 'list').mockResolvedValue({ total_pages: 0, items: [] });
    expect(await invoiceApi.listAll()).toEqual([]);
    expect(list).toHaveBeenCalledOnce();
  });
});
