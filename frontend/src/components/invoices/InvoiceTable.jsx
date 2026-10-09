import { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CHANNEL_LABEL, STATUS_CHIP } from '../../data/constants';
import { currentHandlerFor, currentStageName, downloadCSV } from '../../utils/businessLogic';
import { matchesInvoiceQuery } from '../../utils/invoiceQuery';
import { setSearch, setTablePage, toggleSelectRow, setSelectAll, clearSelection, openModal, pushToast } from '../../features/ui/uiSlice';
import Badge from '../common/Badge.jsx';
import PagerFoot from '../common/PagerFoot.jsx';
import SortDateTh from '../common/SortDateTh.jsx';
import { useDateSort } from '../../utils/dateSort';
import { Mail, Flag, Eye, Download, Inbox, Search } from '../common/icons.jsx';

const PAGE_SIZE = 10;
const EMPTY_SELECTION = Object.freeze([]);

// Pinned columns are given an exact width: the next pinned column's `left` offset is the sum of
// the widths before it, so a column that grew or shrank with its content left a gap or an
// overlap and let the columns scrolling underneath show through.
const CHECK_COL_W = 34;
const INVOICE_COL_W = 150;
const fixedWidth = (w) => ({ width: w, minWidth: w, maxWidth: w, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis' });

// Shared sticky-left style for the first two data columns
const stickyCell = (left, isHead = false) => ({
  position: 'sticky',
  left,
  zIndex: isHead ? 3 : 1,
  background: isHead ? '#F7F8FA' : '#fff',
  boxShadow: 'inset -1px 0 0 var(--border-soft)',
});

/**
 * mode: 'full' (internal, opens Invoice Detail modal), 'simple' (opens Stage Simple modal),
 * 'supplierSafe' (opens the supplier-facing Invoice Detail modal)
 * hideSearch: suppress the in-table search box (used by SearchInvoicePage which has its own)
 * filteredCount: pass current filtered count to label the Export button accurately
 * lead: optional heading shown on the left of the toolbar (the Export button stays on the right)
 */
export default function InvoiceTable({ invoices, tableKey, mode = 'full', bulk = false, hideSearch = false, filteredCount, lead }) {
  const dispatch  = useDispatch();
  const navigate  = useNavigate();
  const [searchParams] = useSearchParams();
  const search    = useSelector((s) => s.ui.search[tableKey] || '');
  const page      = useSelector((s) => s.ui.tablePage[tableKey] || 1);
  const selected  = useSelector((s) => s.ui.tableSelected[tableKey] || EMPTY_SELECTION);
  const isSupplierUser = useSelector((s) => s.auth.authType === 'supplier');

  const matched = useMemo(() => (search ? invoices.filter((inv) => matchesInvoiceQuery(inv, search)) : invoices), [invoices, search]);
  const { sorted: filtered, dir: dateDir, toggle: toggleDate } = useDateSort(matched, (inv) => inv.date);

  const totalPages   = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage  = Math.min(page, totalPages);
  const pageRows     = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pageAllSelected = pageRows.length > 0 && pageRows.every((inv) => selected.includes(inv.no));

  const action = mode === 'simple' ? 'stageSimple' : mode === 'supplierSafe' ? 'supplierInvoiceDetail' : 'invoiceDetail';
  const rowTitle = mode === 'simple' ? 'Click to see current stage' : mode === 'supplierSafe' ? (isSupplierUser ? 'Click to view invoice progress' : 'Click for supplier-facing status') : 'Click for full stage-by-stage status';

  const openInvoice    = (no, poItem) => {
    if (isSupplierUser && mode === 'supplierSafe') {
      // keep the page's filters in the URL so "← All Invoices" returns to the same list
      const next = new URLSearchParams(searchParams);
      next.set('open', no);
      if (poItem !== undefined && poItem !== '') next.set('item', String(poItem)); else next.delete('item');
      navigate({ pathname: '/supplier/home', search: next.toString() });
      return;
    }
    dispatch(openModal({ kind: action, ctx: { no, poItem } }));
  };
  const openVendorCode = (code) => dispatch(openModal({ kind: 'vendorCodePreview', ctx: { code } }));
  const openNotify     = (no, poItem) => dispatch(openModal({ kind: 'notifyPreview',  ctx: { no, poItem } }));
  const openRaiseTicket= (no, poItem) => dispatch(openModal({ kind: 'raiseTicket',    ctx: { no, poItem } }));

  // Suppliers see one vendor code, so vendor columns are noise; owner and "notify" are internal-only.
  const supplierView = mode === 'supplierSafe' && isSupplierUser;
  const colCount = (bulk ? 1 : 0) + (supplierView ? 9 : 12);
  const exportCount = filteredCount ?? filtered.length;
  const exportLabel = `Export to Excel (${exportCount})`;

  const exportCols = supplierView
    ? ['Invoice No', 'Channel', 'PO No', 'Amount', 'Status', 'Current Stage', 'UTR No', 'Date']
    : ['Invoice No', 'Vendor', 'Vendor Code', 'Channel', 'PO No', 'Amount', 'Status', 'Current Stage', 'Owner', 'UTR No', 'Date'];
  const toExportRow = (inv) => {
    if (supplierView) return [inv.no, CHANNEL_LABEL[inv.channel], inv.po, inv.amount, inv.status, currentStageName(inv), inv.utr, inv.date];
    const owner = currentHandlerFor(inv);
    return [inv.no, inv.vendor, inv.vcode, CHANNEL_LABEL[inv.channel], inv.po, inv.amount, inv.status, currentStageName(inv), owner.name, inv.utr, inv.date];
  };
  const exportInvoices = (list, filenameLabel) => {
    downloadCSV(filenameLabel, exportCols, list.map(toExportRow));
    dispatch(pushToast(`Exported ${list.length} invoice${list.length === 1 ? '' : 's'} to Excel.`));
  };

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-left">
          {lead}
          {!hideSearch && (
            <div style={{ position: 'relative', width: 'clamp(260px, 34vw, 420px)' }}>
              <Search
                size={14}
                style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
              />
              <input
                className="search-box"
                style={{ width: '100%', paddingLeft: 32, paddingRight: search ? 30 : 12, fontSize: 13 }}
                placeholder="Invoice no, PO no, PO item, UTR or vendor…"
                title="Type one thing to search invoice, PO, item and UTR, or use commas to match each in order: invoice, PO, item, UTR"
                aria-label="Search invoice, PO, item, UTR or vendor - or comma-separated by position"
                value={search}
                onChange={(e) => dispatch(setSearch({ key: tableKey, value: e.target.value }))}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => dispatch(setSearch({ key: tableKey, value: '' }))}
                  aria-label="Clear search"
                  style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 17, lineHeight: 1, padding: '0 4px' }}
                >&times;</button>
              )}
            </div>
          )}
          {selected.length > 0 && <span className="chip blue">{selected.length} selected</span>}
        </div>

        <div className="toolbar-right">
          {bulk && selected.length > 0 ? (
            <>
              <button type="button" className="btn"
                title={`Send status notification email for ${selected.length} selected invoice(s)`}
                onClick={() => { dispatch(pushToast(`Status email sent for ${selected.length} invoice${selected.length === 1 ? '' : 's'}.`)); dispatch(clearSelection(tableKey)); }}>
                <Mail />Notify Selected
              </button>
              <button type="button" className="btn"
                title={`Export ${selected.length} selected invoice(s) to Excel`}
                onClick={() => {
                  exportInvoices(invoices.filter((inv) => selected.includes(inv.no)), `${tableKey}_selected`);
                  dispatch(clearSelection(tableKey));
                }}>
                <Download />Export Selected to Excel
              </button>
            </>
          ) : (
            <button type="button" className="btn"
              title={`Export the ${exportCount} currently filtered invoice(s) to Excel`}
              onClick={() => exportInvoices(filtered, tableKey)}>
              <Download />{exportLabel}
            </button>
          )}
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {bulk && (
                <th scope="col" style={{ ...fixedWidth(CHECK_COL_W), ...stickyCell(0, true) }}>
                  <input
                    type="checkbox"
                    aria-label="Select all rows on this page"
                    checked={pageAllSelected}
                    onChange={(e) => dispatch(setSelectAll({ key: tableKey, nos: pageRows.map((i) => i.no), checked: e.target.checked }))}
                  />
                </th>
              )}

              {/* Sticky: Invoice No */}
              <th scope="col" style={{ ...fixedWidth(INVOICE_COL_W), ...stickyCell(bulk ? CHECK_COL_W : 0, true) }}>Invoice No</th>
              {/* Sticky: Vendor */}
              {!supplierView && <th scope="col" style={{ ...stickyCell((bulk ? CHECK_COL_W : 0) + INVOICE_COL_W, true), minWidth: 140 }}>Vendor</th>}

              {!supplierView && <th scope="col">Vendor Code</th>}
              <th scope="col">Channel</th>
              <th scope="col">PO No</th>
              <th scope="col" className="num">Amount</th>
              <th scope="col">Status</th>
              <th scope="col">Current Stage</th>
              {/* Renamed from "Handled By" which was truncating */}
              {!supplierView && <th scope="col">Owner</th>}
              <th scope="col">UTR No</th>
              <SortDateTh dir={dateDir} onToggle={toggleDate} />
              <th scope="col" className="col-actions">Actions</th>
            </tr>
          </thead>

          <tbody>
            {pageRows.length === 0 && (
              <tr><td colSpan={colCount}>
                <div className="empty-state">
                  <Inbox />
                  <b>No invoices match</b>
                  <span>Try clearing a filter or widening your date range.</span>
                </div>
              </td></tr>
            )}

            {pageRows.map((inv, rowIndex) => {
              const owner = currentHandlerFor(inv);
              return (
                <tr key={`${inv.no}-${rowIndex}`}>
                  {bulk && (
                    <td style={{ ...fixedWidth(CHECK_COL_W), ...stickyCell(0) }}>
                      <input type="checkbox" aria-label={`Select invoice ${inv.no}`}
                        checked={selected.includes(inv.no)}
                        onChange={() => dispatch(toggleSelectRow({ key: tableKey, no: inv.no }))} />
                    </td>
                  )}

                  {/* Sticky: Invoice No */}
                  <td style={{ ...fixedWidth(INVOICE_COL_W), ...stickyCell(bulk ? CHECK_COL_W : 0) }}>
                    <button type="button" className="link-hero" title={rowTitle} onClick={() => openInvoice(inv.no, inv.poItem)}>
                      {inv.no}
                    </button>
                  </td>

                  {/* Sticky: Vendor */}
                  {!supplierView && (
                    <td style={{ ...stickyCell((bulk ? CHECK_COL_W : 0) + INVOICE_COL_W), whiteSpace: 'normal', minWidth: 140, maxWidth: 200 }}>
                      {inv.vendor}
                    </td>
                  )}

                  {!supplierView && (
                    <td>
                      <button type="button" className="vcode-chip link-hero" title={`Preview vendor code ${inv.vcode}`} onClick={() => openVendorCode(inv.vcode)}>
                        {inv.vcode}
                      </button>
                    </td>
                  )}
                  <td>{CHANNEL_LABEL[inv.channel]}</td>
                  <td>{inv.po}</td>
                  <td className="num mono">{inv.amount}</td>
                  <td><Badge tone={STATUS_CHIP[inv.status] || 'gray'}>{inv.status}</Badge></td>
                  <td className="cell-muted" style={{ whiteSpace: 'normal', minWidth: 150 }}>{currentStageName(inv)}</td>
                  {!supplierView && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {owner.name}
                      {owner.role && owner.name !== 'MDE Invoice Team' && <><br /><span className="cell-sub">{owner.role}</span></>}
                    </td>
                  )}
                  <td>{inv.utr === '-' ? <span className="cell-dim">Not yet visible</span> : inv.utr}</td>
                  <td className="cell-muted">{inv.date}</td>

                  <td className="col-actions">
                    <div className="row-actions">
                      {!supplierView && (
                        <button
                          type="button" className="kebab"
                          title="Notify supplier — preview email recipients (To / CC)"
                          aria-label={`Notify supplier for invoice ${inv.no}`}
                          onClick={() => openNotify(inv.no, inv.poItem)}
                        ><Mail /></button>
                      )}
                      {isSupplierUser && (
                        <button
                          type="button" className="kebab"
                          title="Raise a query on this invoice"
                          aria-label={`Raise query for invoice ${inv.no}`}
                          onClick={() => openRaiseTicket(inv.no, inv.poItem)}
                        ><Flag /></button>
                      )}
                      <button
                        type="button" className="kebab"
                        title={rowTitle}
                        aria-label={`View details for invoice ${inv.no}`}
                        onClick={() => openInvoice(inv.no, inv.poItem)}
                      ><Eye /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <PagerFoot
        total={filtered.length}
        page={currentPage}
        pageSize={PAGE_SIZE}
        onPage={(p) => dispatch(setTablePage({ key: tableKey, page: p }))}
      />
    </div>
  );
}
