import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import uiReducer from '../../features/ui/uiSlice';
import { invoicesQueryApi } from '../../api/invoicesQueryApi';
import GlobalLogsBody from './GlobalLogsBody.jsx';
import { localIsoDate, logRanges, trailText } from '../../utils/logRanges';

// The live (server) log: built, grouped and paged by GET /v1/invoices/events.
vi.mock('../../api/invoiceApi', async (original) => ({ ...await original(), USE_FASTAPI_INVOICES: true }));
const requests = [];
vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn(async (path) => {
      requests.push(path);
      return {
        total: 2, page: 1, page_size: 20, queryError: false,
        items: [
          { key: 'a', when: '2026-11-05T00:00:00', hasTime: false, type: 'Payment', event: 'Payment completed', detail: 'UTR U1',
            invoiceNo: 'DEMO/INV/0101', po: '4500001234', vcode: 'DEMO0001AA', channel: 'msetuSrm', performedBy: 'System',
            invoice: { no: 'DEMO/INV/0101', poItem: 10 }, milestones: 3,
            trail: [{ event: 'Invoice uploaded', when: '2026-11-03T00:00:00' }, { event: 'Booked in SAP', when: '2026-11-04T00:00:00' },
              { event: 'Payment completed', when: '2026-11-05T00:00:00' }] },
          { key: 'q', when: '2026-11-04T10:00:00', hasTime: true, type: 'Query', event: 'Ticket created', detail: 'QRY-1',
            invoiceNo: 'DEMO/INV/0101', po: '4500001234', vcode: 'DEMO0001AA', channel: 'msetuSrm', performedBy: 'Supplier' },
        ],
      };
    }),
    getBlob: vi.fn(async () => new Blob([])),
  },
}));

function show() {
  const store = configureStore({
    reducer: { ui: uiReducer, auth: () => ({ authType: 'internal', role: 'Admin' }), [invoicesQueryApi.reducerPath]: invoicesQueryApi.reducer },
    middleware: (gdm) => gdm().concat(invoicesQueryApi.middleware),
  });
  render(<Provider store={store}><GlobalLogsBody invoiceList={[]} serverQuery={{ kind: 'global', filters: {} }} /></Provider>);
}
const lastQuery = () => new URLSearchParams(requests[requests.length - 1].split('?')[1]);

beforeEach(() => { requests.length = 0; });

describe('Logs / History on the live API', () => {
  it('opens on the last 7 days, one row per invoice, with the milestone trail', async () => {
    show();
    expect(await screen.findByText('Uploaded 03 Nov → Booked 04 Nov → Paid 05 Nov')).toBeInTheDocument();
    const [week] = logRanges();
    expect(lastQuery().get('group')).toBe('invoice');
    expect(lastQuery().get('log_from')).toBe(week.from);
    expect(lastQuery().get('log_to')).toBe(localIsoDate(new Date()));
    expect(screen.getByRole('button', { name: 'Last 7 days' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/2 invoices and queries · last 7 days/)).toBeInTheDocument();
    expect(document.querySelector('.log-actions').textContent).not.toMatch(/Clear/); // the default is not a filter
    expect(screen.getByRole('button', { name: /Export CSV/ })).toBeInTheDocument();
  });

  it('range chips widen the window; Clear goes back to 7 days', async () => {
    show();
    await screen.findByText(/invoices and queries/);
    fireEvent.click(screen.getByRole('button', { name: 'All dates' }));
    await waitFor(() => expect(lastQuery().get('log_from')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));
    await waitFor(() => expect(lastQuery().get('log_from')).toBe(logRanges()[1].from));
    fireEvent.click(screen.getByRole('button', { name: /Clear/ }));
    // back on the default range (served from the cache, so no new request is needed)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Last 7 days' })).toHaveAttribute('aria-pressed', 'true'));
    expect(document.querySelector('.log-actions').textContent).not.toMatch(/Clear/);
  });
});

describe('log date ranges and trails', () => {
  it('counts "last 7 days" including today and starts the FY on 1 April', () => {
    const ranges = logRanges(new Date(2026, 10, 11));
    expect(ranges.map((r) => [r.key, r.from, r.to])).toEqual([
      ['d7', '2026-11-05', '2026-11-11'], ['d30', '2026-10-13', '2026-11-11'], ['d90', '2026-08-14', '2026-11-11'],
      ['fy', '2026-04-01', '2026-11-11'], ['all', '', ''],
    ]);
    expect(logRanges(new Date(2027, 1, 10)).find((r) => r.key === 'fy').from).toBe('2026-04-01');
  });

  it('writes a trail with short labels', () => {
    expect(trailText([{ event: 'Invoice uploaded', when: new Date(2026, 10, 3) }, { event: 'Invoice rejected', when: new Date(2026, 10, 9) }]))
      .toBe('Uploaded 03 Nov → Rejected 09 Nov');
  });
});
