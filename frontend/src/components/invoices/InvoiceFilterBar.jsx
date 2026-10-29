import Dropdown from '../common/Dropdown.jsx';
import { X } from '../common/icons.jsx';
import { INVOICE_FILTER_STATUSES } from '../../data/constants';
import { useDispatch } from 'react-redux';
import { useScope } from '../../features/ui/scope';
import { setScopeFilter } from '../../features/ui/uiSlice';
import SrmInvoiceFilters from './SrmInvoiceFilters.jsx';
import { invoiceDateTypeLabel, invoiceFilterDate } from '../../utils/invoiceDates';

const ALL_STATUSES = INVOICE_FILTER_STATUSES;

/** Invoice date as YYYY-MM-DD. Prefers the raw ISO date; falls back to a "04 Sept 2026" display string. */
export function invoiceYMD(inv, dateField = 'invoice') {
  return invoiceFilterDate(inv, dateField);
}

/**
 * The status + date-range filter used across the app's invoice lists (My Invoices, Search Invoice(s),
 * Processing Channels, a vendor code's invoice log). Statuses in `statusCountBase` (defaults to
 * `invoices`) are counted per option so a user can see what a choice will return before picking it.
 */
export default function InvoiceFilterBar({
  status, dateFrom, dateTo, onStatusChange, onDateFrom, onDateTo, onAllDates, onClear,
  statusCountBase, resultCount, rangeLabel, extra,
}) {
  const scope = useScope();
  const dateLabel = invoiceDateTypeLabel(scope.dateField).replace(/\b\w/g, (letter) => letter.toUpperCase());
  const dispatch = useDispatch();
  const clear = () => {
    for (const [key, value] of [['productType', ''], ['plant', ''], ['division', ''], ['dateField', 'invoice']]) dispatch(setScopeFilter({ key, value }));
    onClear();
  };
  const statusOptions = [
    { value: '', label: 'All Statuses', count: statusCountBase.length },
    ...ALL_STATUSES.map((s) => ({ value: s, label: s, count: statusCountBase.filter((i) => i.status === s).length })),
  ];

  return (
    <div className="card" style={{ marginBottom: '0.875rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.625rem', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 11.875em', minWidth: '0rem' }}>
          <Dropdown label="Status" ariaLabel="Filter by status" value={status} options={statusOptions} onChange={onStatusChange} />
        </div>

        <SrmInvoiceFilters />
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.1875rem', flex: '1 1 10em' }}>
          <span style={{ fontSize: '0.65625rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{dateLabel} From</span>
          <input type="date" className="search-box" style={{ width: '100%' }} value={dateFrom} max={dateTo || undefined}
            onChange={(e) => onDateFrom(e.target.value)} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.1875rem', flex: '1 1 10em' }}>
          <span style={{ fontSize: '0.65625rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{dateLabel} To</span>
          <input type="date" className="search-box" style={{ width: '100%' }} value={dateTo} min={dateFrom || undefined}
            onChange={(e) => onDateTo(e.target.value)} />
        </label>

        <div style={{ display: 'flex', gap: '0.5rem', flex: '0 0 auto' }}>
          <button type="button" className="btn" style={{ height: '2.375rem', whiteSpace: 'nowrap' }}
            title="Remove the date limit" onClick={onAllDates}>All dates</button>
          <button type="button" className="btn" style={{ height: '2.375rem', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
            title="Remove all filters" onClick={clear}><X size={14} />Clear</button>
        </div>
      </div>
      <p style={{ fontSize: '0.71875rem', color: 'var(--text-muted)', margin: '0.625rem 0 0' }}>
        {resultCount.toLocaleString()} invoice{resultCount === 1 ? '' : 's'} &middot; {dateLabel}: {rangeLabel}
        {extra}
      </p>
    </div>
  );
}
