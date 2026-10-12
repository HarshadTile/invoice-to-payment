import Dropdown from '../common/Dropdown.jsx';
import { X } from '../common/icons.jsx';
import { STATUS_CHIP } from '../../data/constants';

const ALL_STATUSES = Object.keys(STATUS_CHIP);

/** Invoice date as YYYY-MM-DD. Prefers the raw ISO date; falls back to a "04 Sept 2026" display string. */
export function invoiceYMD(inv) {
  if (inv.rawDate) return inv.rawDate;
  const months = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
  const [d, m, y] = String(inv.date || '').split(' ');
  const key = months[(m || '').slice(0, 3)];
  return key && y ? `${y}-${key}-${d.padStart(2, '0')}` : '';
}

// Local calendar date as YYYY-MM-DD (toISOString would shift the day for users ahead of UTC)
const toYMD = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** The default view: the rolling last 90 days, ending today. */
export function defaultInvoiceRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 90);
  return { from: toYMD(from), to: toYMD(to) };
}

/**
 * The status + date-range filter used across the app's invoice lists (My Invoices, Search Invoice(s),
 * Processing Channels, a vendor code's invoice log). Statuses in `statusCountBase` (defaults to
 * `invoices`) are counted per option so a user can see what a choice will return before picking it.
 */
export default function InvoiceFilterBar({
  status, dateFrom, dateTo, onStatusChange, onDateFrom, onDateTo, onLast90Days, onAllDates, onClear,
  statusCountBase, resultCount, rangeLabel, extra,
}) {
  const statusOptions = [
    { value: '', label: 'All Statuses', count: statusCountBase.length },
    ...ALL_STATUSES.map((s) => ({ value: s, label: s, count: statusCountBase.filter((i) => i.status === s).length })),
  ];

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 190px', minWidth: 0 }}>
          <Dropdown label="Status" ariaLabel="Filter by status" value={status} options={statusOptions} onChange={onStatusChange} />
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 160px' }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Invoice Date From</span>
          <input type="date" className="search-box" style={{ width: '100%' }} value={dateFrom} max={dateTo || undefined}
            onChange={(e) => onDateFrom(e.target.value)} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 160px' }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Invoice Date To</span>
          <input type="date" className="search-box" style={{ width: '100%' }} value={dateTo} min={dateFrom || undefined}
            onChange={(e) => onDateTo(e.target.value)} />
        </label>

        <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
          <button type="button" className="btn" style={{ height: 38, whiteSpace: 'nowrap' }}
            title="Back to the default view: last 90 days" onClick={onLast90Days}>&#8634; Last 90 days</button>
          <button type="button" className="btn" style={{ height: 38, whiteSpace: 'nowrap' }}
            title="Remove the date limit" onClick={onAllDates}>All dates</button>
          <button type="button" className="btn" style={{ height: 38, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            title="Remove all filters" onClick={onClear}><X size={14} />Clear</button>
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '10px 0 0' }}>
        {resultCount.toLocaleString()} invoice{resultCount === 1 ? '' : 's'} &middot; {rangeLabel}
        {extra}
      </p>
    </div>
  );
}
