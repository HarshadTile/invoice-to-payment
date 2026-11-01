import { describe, expect, it } from 'vitest';
import { auditCategory, auditDay } from './AuditLogsPanel.jsx';

describe('audit log helpers', () => {
  it('groups actions into the filter chips', () => {
    expect(auditCategory('Logged in')).toBe('signin');
    expect(auditCategory('Login')).toBe('signin');
    expect(auditCategory('Failed login')).toBe('failed');
    expect(auditCategory('Approved supplier access request')).toBe('suppliers');
    expect(auditCategory('Changed supplier vendor codes')).toBe('suppliers');
    expect(auditCategory('Removed user')).toBe('users');
    expect(auditCategory('Generated reset link')).toBe('users');
    expect(auditCategory('Updated notification rules')).toBe('settings');
    expect(auditCategory('Something new')).toBe('other');
  });

  it('reads both timestamp formats as a day', () => {
    expect(auditDay('31 Oct 2026, 04:52:10 PM')).toBe('2026-10-31');
    expect(auditDay('6 Aug 2026, 07:10:00 AM')).toBe('2026-08-06');
    expect(auditDay('2026-08-06 07:10')).toBe('2026-08-06');
    expect(auditDay('')).toBe('');
  });
});
