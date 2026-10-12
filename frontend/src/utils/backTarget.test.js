import { describe, it, expect } from 'vitest';
import { backTarget } from './tickets';

describe('backTarget', () => {
  it('goes to the queries list when nothing says where you came from', () => {
    expect(backTarget(undefined, false)).toEqual({ path: '/app/inquiry-desk', label: 'Back to queries' });
    expect(backTarget(undefined, true)).toEqual({ path: '/supplier/tickets', label: 'Back to queries' });
  });
  it('returns to the Notifications page when opened from there', () => {
    expect(backTarget('/app/notifications', false)).toEqual({ path: '/app/notifications', label: 'Back to notifications' });
    expect(backTarget('/supplier/notifications', true).label).toBe('Back to notifications');
  });
  it('returns to any other in-app page it was opened from', () => {
    expect(backTarget('/app/invoices?status=Paid', false)).toEqual({ path: '/app/invoices?status=Paid', label: 'Back' });
  });
  it('ignores anything that is not an in-app path', () => {
    for (const bad of ['https://evil.example', '//evil.example', 'javascript:alert(1)', 5, null]) {
      expect(backTarget(bad, false).path).toBe('/app/inquiry-desk');
    }
  });
});
