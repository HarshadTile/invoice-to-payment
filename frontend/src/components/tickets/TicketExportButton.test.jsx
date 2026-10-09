import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { downloadCSV } from '../../utils/businessLogic';
import TicketExportButton from './TicketExportButton';

vi.mock('../../utils/businessLogic', () => ({ downloadCSV: vi.fn() }));

const ticket = {
  ticket_no: 'QRY-1', subject: '=HYPERLINK("example")', invoice_no: 'INV-1',
  vendor_code: 'VENDOR-1', channel: 'msetuSrm', category: 'Payment', priority: 'HIGH',
  assignee: { name: 'Accounts' }, status: 'OPEN', awaiting: 'STAFF', sla: { breached: true },
  description: 'Private description', internal_notes: 'Private note',
};

function setup(authType, props = {}) {
  const store = configureStore({ reducer: { auth: () => ({ authType }) } });
  render(<Provider store={store}><TicketExportButton tickets={[ticket]} {...props} /></Provider>);
}

describe('ticket exports', () => {
  it('exports the provided internal view and neutralizes spreadsheet formulas', () => {
    setup('internal');
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV (1)' }));
    const [filename, columns, rows] = downloadCSV.mock.lastCall;
    expect(filename).toBe('Inquiry_Desk');
    expect(columns).toContain('Vendor Code');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('VENDOR-1');
    expect(rows[0]).toContain('\'=HYPERLINK("example")');
    expect(rows[0]).not.toContain('Private note');
    expect(rows[0]).not.toContain('Private description');
  });

  it('exports only supplier table fields', () => {
    setup('supplier');
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV (1)' }));
    const [filename, columns, rows] = downloadCSV.mock.lastCall;
    expect(filename).toBe('My_Queries');
    expect(columns).not.toContain('Vendor Code');
    expect(rows[0]).not.toContain('VENDOR-1');
    expect(rows[0]).toHaveLength(columns.length);
  });

  it('disables export when no queries are visible', () => {
    setup('internal', { tickets: [] });
    expect(screen.getByRole('button', { name: 'Export CSV (0)' })).toBeDisabled();
  });
});
