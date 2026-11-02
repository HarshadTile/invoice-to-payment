import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { openModal, pushToast, setPageFilters, setTablePage } from '../../features/ui/uiSlice';
import { SRM_COLUMNS, srmColumns, srmCell } from '../../utils/srmWorkspace';
import { downloadCSV, timestampedExportName } from '../../utils/csv';
import { dateValue } from '../../utils/dateSort';
import { STATUS_CHIP } from '../../data/constants';
import PagerFoot from '../common/PagerFoot.jsx';
import SortDateTh from '../common/SortDateTh.jsx';
import Badge from '../common/Badge.jsx';
import { Columns, Download, Eye } from '../common/icons.jsx';

export const PAGE_SIZE = 20;
const STANDARD = { preset: 'standard' };

/** The SRM / PO Portal register table. With `server`, the list is paged on the server: `invoices` is
 *  the current page, and { total, onSort(sort), fetchAll() } give the count, the date sort ("field:dir")
 *  and every matching invoice for the export. The table's page is ui.tablePage[pageKeyFor(...)]. */
export const pageKeyFor = (namespace, view) => `${namespace}-data-${view}`;

export default function SrmDataTable({ invoices, view, canExport, config, server }) {
  const dispatch = useDispatch();
  const namespace = config?.namespace || 'srm';
  const availableColumns = config?.columns || SRM_COLUMNS;
  const resolveColumns = config?.resolveColumns || srmColumns;
  const settingsKey = `${namespace}-columns-${view}`;
  const selection = useSelector((state) => state.ui.pageFilters[settingsKey]) || STANDARD;
  const pageKey = pageKeyFor(namespace, view);
  const page = useSelector((state) => state.ui.tablePage[pageKey] || 1);
  const columns = useMemo(() => resolveColumns(view, selection), [view, selection, resolveColumns]);
  const [sort, setSort] = useState({ key: null, dir: 'desc' });
  // The Columns panel closes on a click anywhere outside it or on Escape, not only on its button.
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnsRef = useRef(null);
  useEffect(() => {
    if (!columnsOpen) return undefined;
    const onPointer = (event) => { if (columnsRef.current && !columnsRef.current.contains(event.target)) setColumnsOpen(false); };
    const onKey = (event) => { if (event.key === 'Escape') setColumnsOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [columnsOpen]);
  // Paged on the server: tell it the sort (by the column's server field) whenever it changes.
  const sortEntry = columns.find((column) => column.key === sort.key);
  const serverSort = sortEntry?.sort ? `${sortEntry.sort}:${sort.dir}` : undefined;
  const onServerSort = server?.onSort;
  useEffect(() => { onServerSort?.(serverSort); }, [onServerSort, serverSort]);
  const sorted = useMemo(() => {
    const entry = columns.find((column) => column.key === sort.key);
    if (server || !entry) return invoices;
    return invoices.map((invoice, index) => ({ invoice, index, ms: dateValue(entry.read(invoice)) }))
      .sort((a, b) => a.ms == null || b.ms == null ? (a.ms == null) - (b.ms == null) || a.index - b.index
        : (a.ms - b.ms) * (sort.dir === 'asc' ? 1 : -1) || a.index - b.index).map((item) => item.invoice);
  }, [invoices, columns, sort, server]);
  const total = server ? server.total : sorted.length;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(total / PAGE_SIZE)));
  const visible = server ? sorted : sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const [exporting, setExporting] = useState(false);
  const exportRows = async () => {
    const name = timestampedExportName(`${config?.label || 'SRM'}_${view}`);
    const toCsv = (list) => downloadCSV(name, columns.map((entry) => entry.label), list.map((invoice) => columns.map((entry) => srmCell(invoice, entry))));
    if (!server) { toCsv(sorted); return; }
    setExporting(true);
    try {
      toCsv(await server.fetchAll());
    } catch (error) {
      dispatch(pushToast(`Export failed: ${error?.message || 'try again'}`));
    } finally {
      setExporting(false);
    }
  };
  const save = (next) => dispatch(setPageFilters({ key: settingsKey, filters: next }));
  const toggleColumn = (key) => {
    const selected = columns.map((column) => column.key);
    save({ preset: 'custom', columns: selected.includes(key) ? selected.filter((entry) => entry !== key) : [...selected, key] });
  };
  const openInvoice = (invoice) => dispatch(openModal({ kind: 'invoiceDetail', ctx: {
    no: invoice.no, poItem: invoice.poItem, vcode: invoice.vcode, po: invoice.po,
    channel: invoice.channel, sourceId: invoice.sourceId,
  } }));

  return <div className="card">
    <div className="toolbar">
      <span className="srm-table-title">Invoices<span className="srm-count-pill">{total.toLocaleString()} matching</span></span>
      <div className="toolbar-right">
        <details className="srm-columns" ref={columnsRef} open={columnsOpen}>
          {/* the button drives the panel itself (Enter / Space included), so outside clicks can close it */}
          <summary className="btn btn-sm" onClick={(event) => { event.preventDefault(); setColumnsOpen((open) => !open); }}>
            <Columns />Columns
          </summary>
          <div className="srm-columns-panel">
            <label>Column preset
              <select aria-label="Column preset" className="search-box" value={selection.preset} onChange={(event) => save({ preset: event.target.value })}>
                <option value="standard">Standard</option><option value="approvals">Approvals</option>
                <option value="all">All {config?.label || 'SRM'} fields</option>
                {selection.preset === 'custom' && <option value="custom">Custom</option>}
              </select>
            </label>
            <p className="cell-muted">Invoice and vendor stay pinned.</p>
            {availableColumns.map((entry) => <label className="srm-column-option" key={entry.key}>
              <input type="checkbox" checked={columns.some((column) => column.key === entry.key)}
                disabled={['invoice', 'vendor'].includes(entry.key)} onChange={() => toggleColumn(entry.key)} />{entry.label}
            </label>)}
          </div>
        </details>
        {canExport && <button type="button" className="btn btn-sm" disabled={exporting} onClick={exportRows}>
          <Download />{exporting ? 'Preparing export…' : `Export to Excel (${total.toLocaleString()})`}</button>}
      </div>
    </div>
    <div className="table-scroll">
      <table className="data-table srm-data-table">
        <thead><tr>{columns.map((entry) => entry.type === 'date'
          ? <SortDateTh key={entry.key} label={entry.label} dir={sort.key === entry.key ? sort.dir : null}
            onToggle={() => setSort((current) => ({ key: entry.key, dir: current.key === entry.key && current.dir === 'desc' ? 'asc' : 'desc' }))} />
          : <th key={entry.key} className={entry.key === 'invoice' ? 'srm-pin-invoice' : entry.key === 'vendor' ? 'srm-pin-vendor' : undefined}>{entry.label}</th>)}
          <th>Actions</th></tr></thead>
        <tbody>
          {!visible.length && <tr><td colSpan={columns.length + 1}>No invoices match these filters.</td></tr>}
          {visible.map((invoice, index) => <tr key={`${invoice.vcode}|${invoice.no}|${invoice.po}|${invoice.poItem}|${index}`}>
            {columns.map((entry) => {
              const text = srmCell(invoice, entry);
              // One line per row; long values are cut with an ellipsis and shown in full on hover.
              return <td key={entry.key} title={text.length > 22 ? text : undefined}
                className={entry.key === 'invoice' ? 'srm-pin-invoice' : entry.key === 'vendor' ? 'srm-pin-vendor' : undefined}>
                {entry.key === 'invoice' ? <button type="button" className="link-hero" onClick={() => openInvoice(invoice)}>{invoice.no}</button>
                  : entry.key === 'status' ? <Badge tone={STATUS_CHIP[invoice.status] || 'gray'}>{invoice.status}</Badge> : text}
              </td>;
            })}
            <td><button type="button" className="btn btn-xs" aria-label={`View details for ${invoice.no}, PO ${invoice.po}, item ${invoice.poItem}`} onClick={() => openInvoice(invoice)}><Eye />View</button></td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <PagerFoot total={total} page={currentPage} pageSize={PAGE_SIZE}
      onPage={(next) => dispatch(setTablePage({ key: pageKey, page: next }))} />
  </div>;
}
