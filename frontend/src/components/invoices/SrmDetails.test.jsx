import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import SrmDetails from './SrmDetails.jsx';

const invoice = {
  channel: 'msetuSrm', statusLabel: 'Approved', statusFlag: 'A',
  workflow: { approvers: { approver_1: 'First Approver', approver_2: 'Second Approver' }, approved_by: 'Second Approver',
    final_approval_date: '2026-09-17', document_sent_to_accounts_date: '2026-09-18', pending_with: null },
  sap: { miro_status: 'Booked', document_date: '2026-10-15', posting_date: '2026-10-16' },
};

describe('Msetu / SRM details in the invoice popup', () => {
  it('shows the approval chain and SAP dates to the internal team', () => {
    render(<SrmDetails invoice={invoice} internal />);
    expect(screen.getByText('Msetu / SRM Approvals & SAP')).toBeInTheDocument();
    expect(screen.getByText('Approver 1')).toBeInTheDocument();
    expect(screen.getByText('First Approver')).toBeInTheDocument();
    expect(screen.queryByText('Approver 3')).not.toBeInTheDocument(); // empty approvers are left out
    for (const label of ['Approval Date', 'Sent to Accounts Date', 'MIRO Document Date', 'Posting Date']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('is hidden from suppliers and for PO Portal invoices', () => {
    const { container: supplier } = render(<SrmDetails invoice={invoice} />);
    expect(supplier).toBeEmptyDOMElement();
    const { container: po } = render(<SrmDetails invoice={{ ...invoice, channel: 'poPortal' }} internal />);
    expect(po).toBeEmptyDOMElement();
  });
});
