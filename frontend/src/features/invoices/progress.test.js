import { describe, it, expect } from 'vitest';
import { invoiceSteps } from './progress';

const states = (inv) => invoiceSteps(inv).map((s) => s.state);

describe('invoiceSteps', () => {
  it('marks the steps before the current status done and the rest to do', () => {
    expect(states({ status: 'Approved' })).toEqual(['done', 'done', 'done', 'current', 'todo', 'todo']);
    expect(states({ status: 'Level Approved' })).toEqual(['done', 'done', 'current', 'todo', 'todo', 'todo']);
  });

  it('shows a paid invoice as complete, with the UTR beside the payment date', () => {
    const steps = invoiceSteps({ status: 'Paid', utr: 'UTR1', sap: { clearing_date: '2026-05-19' } });
    expect(steps.every((s) => s.state === 'done')).toBe(true);
    expect(steps.at(-1).date).toBe('19 May 2026 (UTR1)');
  });

  it('fails a rejected invoice after upload and a deleted one from the start', () => {
    expect(states({ status: 'Rejected' })).toEqual(['done', 'fail', 'fail', 'fail', 'fail', 'fail']);
    expect(states({ status: 'Entry Deleted' })).toEqual(['fail', 'fail', 'fail', 'fail', 'fail', 'fail']);
  });
});
