import { describe, expect, it } from 'vitest';
import { formatAuditTime, startOfToday } from './AuditLogsPanel.jsx';
import { auditQuery } from '../../api/auditApi';

describe('audit log page helpers', () => {
  it('shows UTC times in the viewer’s time zone', () => {
    expect(formatAuditTime('2026-11-11T09:00:00+00:00', 'en-GB')).toMatch(/11 Nov 2026/);
    expect(formatAuditTime('not a time')).toBe('');
  });

  it('counts "today" from the viewer’s local midnight', () => {
    const start = new Date(startOfToday(new Date(2026, 10, 11, 15, 30)));
    expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours(), start.getMinutes()]).toEqual([2026, 10, 11, 0, 0]);
  });

  it('sends only the filters that are set', () => {
    expect(auditQuery({ page: 2, category: 'all', q: '', since: undefined })).toBe('page=2');
    expect(auditQuery({ category: 'failed', q: 'ravi k' })).toBe('category=failed&q=ravi+k');
  });
});
