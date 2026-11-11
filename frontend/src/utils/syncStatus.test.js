import { describe, it, expect } from 'vitest';
import { formatAge, formatSyncTime, freshnessLabel } from './syncStatus';

const NOW = new Date('2026-11-10T09:00:00Z');

describe('invoice data freshness wording', () => {
  it('formats ages', () => {
    expect(formatAge(0.2)).toBe('just now');
    expect(formatAge(42)).toBe('42 min ago');
    expect(formatAge(180)).toBe('3 h ago');
    expect(formatAge(60 * 24 * 4)).toBe('4 days ago');
  });

  it('ignores missing or invalid timestamps', () => {
    expect(formatSyncTime(null)).toBe('');
    expect(formatSyncTime('not a date')).toBe('');
    expect(freshnessLabel(null)).toBeNull();
    expect(freshnessLabel({ dataAsOf: null })).toBeNull();
  });

  it('is calm while the sync is healthy', () => {
    const label = freshnessLabel({ live: true, dataAsOf: '2026-11-10T08:30:00Z', lastSyncOk: true, stale: false }, NOW);
    expect(label.tone).toBe('ok');
    expect(label.text).toMatch(/^Data as of /);
    expect(label.title).toMatch(/30 min ago/);
  });

  it('warns when the last sync failed or the data is stale', () => {
    const failing = freshnessLabel({ live: true, dataAsOf: '2026-11-06T12:52:00Z', lastSyncOk: false, stale: true }, NOW);
    expect(failing.tone).toBe('warn');
    expect(failing.title).toMatch(/latest automatic update failed/);
    const stale = freshnessLabel({ live: true, dataAsOf: '2026-11-06T12:52:00Z', lastSyncOk: true, stale: true }, NOW);
    expect(stale.tone).toBe('warn');
    expect(stale.title).toMatch(/has not been updated for 4 days/);
  });

  it('explains local-file mode', () => {
    const label = freshnessLabel({ live: false, dataAsOf: '2026-11-10T08:00:00Z', lastSyncOk: true, stale: false }, NOW);
    expect(label.tone).toBe('ok');
    expect(label.title).toMatch(/local files/);
  });
});
