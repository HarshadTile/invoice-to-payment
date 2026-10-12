import { LOG_TYPES } from '../../utils/supplierLog';
import { Download, Search } from './icons.jsx';

/**
 * The filter bar shared by both Logs pages. A full-width search sits on top; below it the labelled
 * Type / From / To fields are on the left and Clear / Export on the right. The layout holds at any
 * width: the fields wrap as a group and the actions stay on the right.
 */
export default function LogFilterBar({
  filters, onChange, onClear, filtersActive, onExport, exportCount, searchPlaceholder = 'Search invoice, vendor, PO or details',
}) {
  return (
    <div className="log-filters">
      <label className="log-search">
        <Search />
        <input
          type="search" value={filters.search} onChange={onChange('search')}
          placeholder={searchPlaceholder} aria-label="Search the log"
        />
      </label>

      <div className="log-filter-row">
        <div className="log-fields">
          <label className="log-field">
            <span>Type</span>
            <select aria-label="Filter by type" value={filters.type} onChange={onChange('type')}>
              <option value="all">All types</option>
              {LOG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="log-field">
            <span>From</span>
            <input type="date" aria-label="From date" value={filters.from} max={filters.to || undefined} onChange={onChange('from')} />
          </label>
          <label className="log-field">
            <span>To</span>
            <input type="date" aria-label="To date" value={filters.to} min={filters.from || undefined} onChange={onChange('to')} />
          </label>
        </div>

        <div className="log-actions">
          {filtersActive && <button type="button" className="btn" onClick={onClear}>Clear</button>}
          <button type="button" className="btn" onClick={onExport} disabled={exportCount === 0}><Download />Export ({exportCount})</button>
        </div>
      </div>
    </div>
  );
}
