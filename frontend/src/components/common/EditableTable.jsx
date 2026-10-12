import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setSearch, setTablePage, openModal } from '../../features/ui/uiSlice';
import PagerFoot from '../common/PagerFoot.jsx';
import Badge from './Badge.jsx';
import SortDateTh from './SortDateTh.jsx';
import { dateValue } from '../../utils/dateSort';
import { Download, Inbox, Mail } from './icons.jsx';

const PAGE_SIZE = 20;

function renderCell(v) {
  if (v === '-') return <span style={{ color: '#CBD5E1' }}>-</span>;
  if (['Yes', 'Active', 'Success', 'Paid', 'Approved'].includes(v)) return <Badge tone="green">{v}</Badge>;
  if (['No', 'Inactive', 'Failed', 'Rejected', 'Deleted'].includes(v)) return <Badge tone="red">{v}</Badge>;
  if (['Pending', 'Pending Approval'].includes(v)) return <Badge tone="amber">{v}</Badge>;
  return v;
}

/**
 * A generic read-only table over an array-of-arrays row store (tablesSlice): search,
 * pagination, optional export, optional statusCol (invoice/vendor-code quick links + notify).
 * Rows are derived from system data, never entered or edited by hand here.
 */
export default function EditableTable({
  tableKey, cols, rows, canImportExport = true, statusCol = false, tableClass,
  onViewInvoice, onViewVendorCode, onNotify,
}) {
  const dispatch = useDispatch();
  const search = useSelector((s) => s.ui.search[tableKey] || '');
  const page = useSelector((s) => s.ui.tablePage[tableKey] || 1);

  const q = search.toLowerCase();
  const matched = rows.filter((r) => !q || r.some((c) => String(c).toLowerCase().includes(q)));
  // Any column called "... Date" sorts on click; one date column is active at a time.
  const [sort, setSort] = useState({ col: null, dir: null });
  const isDateCol = (c) => /\bdate\b/i.test(c);
  const toggleSort = (ci) => setSort((cur) => ({ col: ci, dir: cur.col === ci && cur.dir === 'desc' ? 'asc' : 'desc' }));
  const filtered = sort.col === null ? matched : matched
    .map((r, index) => ({ r, index, ms: dateValue(r[sort.col]) }))
    .sort((a, b) => {
      if (a.ms === null || b.ms === null) return (a.ms === null) - (b.ms === null) || a.index - b.index;
      return (a.ms - b.ms) * (sort.dir === 'asc' ? 1 : -1) || a.index - b.index;
    })
    .map((x) => x.r);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const vcodeIdx = statusCol ? cols.indexOf('Vendor Code') : -1;

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-left">
          <input className="search-box" style={{ width: 260 }} placeholder="Search this table..." value={search} onChange={(e) => dispatch(setSearch({ key: tableKey, value: e.target.value }))} />
        </div>
        <div className="toolbar-right">
          {canImportExport && (
            <button type="button" className="btn" onClick={() => dispatch(openModal({ kind: 'export', ctx: { tableKey, cols, rows, label: tableKey } }))}><Download />Export to Excel ({rows.length})</button>
          )}
        </div>
      </div>
      <div className="table-scroll">
        <table className={tableClass}>
          <thead>
            <tr>
              {cols.map((c, ci) => (isDateCol(c)
                ? <SortDateTh key={c} label={c} dir={sort.col === ci ? sort.dir : null} onToggle={() => toggleSort(ci)} />
                : <th key={c}>{c}</th>))}
              {statusCol && <th>Notify</th>}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr><td colSpan={cols.length + (statusCol ? 1 : 0)}>
                <div className="empty-state">
                  <Inbox />
                  <b>Nothing to show</b>
                  <span>{search ? 'No rows match your search.' : 'This table has no entries yet.'}</span>
                </div>
              </td></tr>
            )}
            {pageRows.map((r) => {
              const rowIdx = rows.indexOf(r);
              return (
                <tr key={rowIdx}>
                  {r.map((c, ci) => {
                    if (statusCol && ci === 0) return <td key={ci}><button type="button" className="link-hero" title="Click for full stage-by-stage status" onClick={() => onViewInvoice && onViewInvoice(r[0])}>{c}</button></td>;
                    if (statusCol && ci === vcodeIdx) return <td key={ci}><button type="button" className="link-hero" title={`Preview ${c}`} onClick={() => onViewVendorCode && onViewVendorCode(c)}>{c}</button></td>;
                    return <td key={ci}>{renderCell(c)}</td>;
                  })}
                  {statusCol && <td><button type="button" className="kebab" title="Notify Supplier: preview To / CC" aria-label="Notify supplier" onClick={() => onNotify && onNotify(r[0])}><Mail /></button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <PagerFoot total={filtered.length} page={currentPage} pageSize={PAGE_SIZE} onPage={(p) => dispatch(setTablePage({ key: tableKey, page: p }))} />
    </div>
  );
}
