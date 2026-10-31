import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import uiReducer from '../../features/ui/uiSlice';
import PoPortalWorkspace from './PoPortalWorkspace.jsx';
import { toWorkspaceInvoice } from '../../api/invoiceApi';
import { findInvoice, downloadCSV } from '../../utils/businessLogic';
import { PO_TABLE_CONFIG, matchesPoPortalWorkspace, poPortalHistoryRows } from '../../utils/poPortalWorkspace';

vi.mock('../../api/client', () => ({ api: { get: vi.fn(async () => []) } }));
vi.mock('../../utils/businessLogic', async (original) => ({ ...await original(), downloadCSV: vi.fn() }));

const invoice = { no: 'INV/PO/1', sourceId: 'poPortal:one', po: '650001', poItem: 10, vendor: 'Vendor', vcode: 'V1',
  channel: 'poPortal', productType: 'S', status: 'Pending for Approval', amount: '-', utr: '-', invoiceUploaded: true,
  rawDate: '2026-09-01', rawUploadDate: '2026-09-02', workflow: { pending_with: 'Reviewer B' },
  sap: { miro_status: 'PENDING FOR MIRO' }, poPortal: { hod1: 'Reviewer A', hod1_status: 'APPROVED',
    hod2: 'Reviewer B', hod2_status: null, service: '000123', line_number: '1', source_approval_stage: 'HOD1', approval_stage: 'HOD1 Approved' } };
const second = { ...invoice, sourceId: 'poPortal:two', poPortal: { ...invoice.poPortal, line_number: '2', hod2_status: 'APPROVED' }, status: 'Paid' };

describe('PO Portal workspace', () => {
  it('retains channel, source identity and explicit MIRO date in the API adapter', () => {
    const mapped = toWorkspaceInvoice({ channel: 'poPortal', source_id: 'poPortal:one', invoice_number: 'INV/PO/1',
      overall_status: 'Miro Booked', po_portal: invoice.poPortal, sap: { miro_booking_date: '2026-10-01' },
      workflow: { rejection_reason: 'Historical rejection' } });
    expect(mapped.channel).toBe('poPortal');
    expect(mapped.sourceId).toBe('poPortal:one');
    expect(mapped.poPortal.line_number).toBe('1');
    expect(mapped.date).toBe('01 Oct 2026');
    expect(mapped.shortPayReason).toBeUndefined();
    expect(mapped.rejectionReason).toBe('Historical rejection');
  });

  it('selects the exact service line and does not fall back to another row', () => {
    expect(findInvoice(invoice.no, 10, [invoice, second], { sourceId: second.sourceId })).toBe(second);
    expect(findInvoice(invoice.no, 10, [invoice, second], { sourceId: 'missing' })).toBeUndefined();
  });

  it('filters recorded blank approvals without treating them as rejected or approved', () => {
    expect(matchesPoPortalWorkspace(invoice, { hod2_status: '__blank__' }, 'invoice')).toBe(true);
    expect(matchesPoPortalWorkspace(second, { hod2_status: '__blank__' }, 'invoice')).toBe(false);
    expect(matchesPoPortalWorkspace(invoice, { hod1_status: 'REJECTED' }, 'invoice')).toBe(false);
    expect(matchesPoPortalWorkspace(invoice, { approver: 'reviewer b' }, 'invoice')).toBe(true);
    expect(matchesPoPortalWorkspace(invoice, { date_from: '2026-01-01' }, 'approval')).toBe(false);
  });

  it('exports original approval values and creates history only for dated facts', () => {
    const columns = PO_TABLE_CONFIG.resolveColumns('Invoice Log', { preset: 'all' });
    expect(columns.some((c) => c.label === 'HOD2 Status')).toBe(true);
    expect(columns.some((c) => c.label === 'Approver 7')).toBe(false);
    const rows = poPortalHistoryRows([invoice]);
    expect(rows.map((r) => r.event)).toEqual(['Invoice dated', 'Invoice uploaded']);
  });

  it('keeps filters across tabs, exports matching lines and opens the selected source row', () => {
    const store = configureStore({ reducer: { ui: uiReducer, auth: () => ({ authType: 'internal', role: 'Admin', channelScope: 'all' }) } });
    render(<Provider store={store}><MemoryRouter><PoPortalWorkspace invoices={[invoice, second]} canExport /></MemoryRouter></Provider>);
    fireEvent.click(screen.getByRole('button', { name: 'Filter by status' }));
    fireEvent.click(screen.getByRole('option', { name: /^Pending for Approval/ }));
    expect(screen.getAllByRole('button', { name: 'INV/PO/1' })).toHaveLength(1);
    fireEvent.click(screen.getByText('Columns'));
    fireEvent.change(screen.getByLabelText('Column preset'), { target: { value: 'approvals' } });
    expect(screen.getByRole('columnheader', { name: 'HOD1 Status' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Export to Excel (1)' }));
    expect(downloadCSV.mock.lastCall[2]).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'INV/PO/1' }));
    expect(store.getState().ui.modal.ctx.sourceId).toBe('poPortal:one');
  });

  it('matches SRM: two tabs, three quick filters and saved obsolete filters ignored', () => {
    const store = configureStore({ reducer: { ui: uiReducer, auth: () => ({ authType: 'internal', role: 'Admin', channelScope: 'all' }) },
      preloadedState: { ui: { ...uiReducer(undefined, { type: 'init' }), pageFilters: { poPortalWorkspace: { hod2_status: 'REJECTED', payment_status: 'paid' } } } } });
    render(<Provider store={store}><MemoryRouter><PoPortalWorkspace invoices={[invoice, second]} canExport /></MemoryRouter></Provider>);
    expect(screen.getByRole('button', { name: 'Invoice Register' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'History' })).toBeTruthy();
    for (const removed of ['Invoice Log', 'Approver Assignment', 'Service Entry (ML81N)', 'SAP Booking (MIRO)', 'Payment Status', 'HOD1 Status', 'HOD2 Status', 'Accounts Status', 'MIRO Status', 'Invoice Uploaded']) {
      expect(screen.queryByRole('button', { name: removed })).toBeNull();
    }
    // the stale HOD2 / payment filters from an older version no longer hide rows
    expect(screen.getAllByRole('button', { name: 'INV/PO/1' })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Filter by approver' }));
    fireEvent.click(screen.getByRole('option', { name: /^Reviewer B/ }));
    expect(screen.getAllByRole('button', { name: 'INV/PO/1' })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Filter by source approval stage' }));
    expect(screen.getByRole('option', { name: /^HOD1/ })).toBeTruthy();
  });
});
