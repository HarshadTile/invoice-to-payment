import { LOG_TYPES } from '../../utils/supplierLog';
import { Calendar, Download, RotateCcw, Search, Sliders } from './icons.jsx';

/**
 * The filter bar shared by both Logs pages. A full-width search sits on top; below it the Type and
 * date range are compact chips on the left and Clear / Export on the right. The layout holds at any
 * width: the chips wrap as a group and the actions stay on the right.
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
          <label className={`log-chip${filters.type !== 'all' ? ' has-value' : ''}`}>
            <Sliders size={12} />
            <span className="log-chip-label">Type</span>
            <select aria-label="Filter by type" value={filters.type} onChange={onChange('type')}>
              <option value="all">All types</option>
              {LOG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <div className={`date-range-chip${filters.from || filters.to ? ' has-value' : ''}`}>
            <Calendar size={12} />
            <input type="date" aria-label="From date" value={filters.from} max={filters.to || undefined} onChange={onChange('from')} />
            <span aria-hidden="true">–</span>
            <input type="date" aria-label="To date" value={filters.to} min={filters.from || undefined} onChange={onChange('to')} />
          </div>
        </div>

        <div className="log-actions">
          {filtersActive && <button type="button" className="btn btn-sm btn-ghost" onClick={onClear}><RotateCcw size={13} />Clear</button>}
          <button type="button" className="btn btn-sm" onClick={onExport} disabled={exportCount === 0}><Download />Export ({exportCount.toLocaleString()})</button>
        </div>
      </div>
    </div>
  );
}
