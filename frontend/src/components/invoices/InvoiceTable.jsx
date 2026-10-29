import { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CHANNEL_LABEL, STATUS_CHIP } from '../../data/constants';
import { currentStageName, invoiceProductType, downloadCSV, timestampedExportName } from '../../utils/businessLogic';
import { matchesInvoiceQuery } from '../../utils/invoiceQuery';
import { setSearch, setTablePage, toggleSelectRow, setSelectAll, clearSelection, openModal, pushToast } from '../../features/ui/uiSlice';
import Badge from '../common/Badge.jsx';
import PagerFoot from '../common/PagerFoot.jsx';
import SortDateTh from '../common/SortDateTh.jsx';
import { useDateColumnSort } from '../../utils/dateSort';
import { invoiceDateLabel, formatInvoiceDate } from '../../utils/invoiceDates';
import { totalsByCurrency } from '../../utils/amounts';
import { Flag, Eye, Download, Inbox, Search } from '../common/icons.jsx';

const PAGE_SIZE = 10;
const EMPTY_SELECTION = Object.freeze([]);
const DATE_COLUMNS = { invoice: (inv) => inv.rawDate, upload: (inv) => inv.rawUploadDate, status: (inv) => inv.date, due: (inv) => inv.sap?.net_due_date };
const poItemValue = (inv) => inv.poItem === '' || inv.poItem == null ? '-' : inv.poItem;
const rejectionReason = (inv) => inv.status === 'Rejected'
  ? (inv.rejectionReason || inv.workflow?.rejection_reason || inv.shortPayReason || 'Not provided') : '-';

// Pinned columns are given an exact width: the next pinned column's `left` offset is the sum of
// the widths before it, so a column that grew or shrank with its content left a gap or an
// overlap and let the columns scrolling underneath show through.
const CHECK_COL_W = 2.125;
const INVOICE_COL_W = 9.375;
const fixedWidth = (w) => ({ width: `${w}rem`, minWidth: `${w}rem`, maxWidth: `${w}rem`, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis' });

// Shared sticky-left style for the first two data columns
const stickyCell = (left, isHead = false) => ({
  position: 'sticky',
  left: `${left}rem`,
  zIndex: isHead ? 3 : 1,
  background: isHead ? '#F7F8FA' : '#fff',
  boxShadow: 'inset -0.0625rem 0 0 var(--border-soft)',
});

/**
 * mode: 'full' (internal, opens Invoice Detail modal), 'simple' (opens Stage Simple modal),
 * 'supplierSafe' (opens the supplier-facing Invoice Detail modal)
 * hideSearch: suppress the in-table search box (used by SearchInvoicePage which has its own)
 * filteredCount: pass current filtered count to label the Export button accurately
 * lead: optional heading shown on the left of the toolbar (the Export button stays on the right)
 */
export default function InvoiceTable({ invoices, tableKey, mode = 'full', bulk = false, hideSearch = false, filteredCount, lead, showFilteredAmount = false, exportName }) {
  const dispatch  = useDispatch();
  const navigate  = useNavigate();
  const [searchParams] = useSearchParams();
  const search    = useSelector((s) => s.ui.search[tableKey] || '');
  const page      = useSelector((s) => s.ui.tablePage[tableKey] || 1);
  const selected  = useSelector((s) => s.ui.tableSelected[tableKey] || EMPTY_SELECTION);
  const isSupplierUser = useSelector((s) => s.auth.authType === 'supplier');

  const matched = useMemo(() => (search ? invoices.filter((inv) => matchesInvoiceQuery(inv, search)) : invoices), [invoices, search]);
  const { sorted: filtered, toggle: toggleDate, dirFor } = useDateColumnSort(matched, DATE_COLUMNS);
  const amountSummary = useMemo(() => {
    if (!showFilteredAmount) return null;
    const totals = totalsByCurrency(filtered);
    const known = filtered.filter((invoice) => Object.keys(totalsByCurrency([invoice])).length > 0).length;
    const value = Object.entries(totals).map(([currency, amount]) => `${currency}${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).join(' + ');
    return { known, value: value || (filtered.length ? 'Not available' : '—') };
  }, [filtered, showFilteredAmount]);

  const totalPages   = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage  = Math.min(page, totalPages);
  const pageRows     = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pageAllSelected = pageRows.length > 0 && pageRows.every((inv) => selected.includes(inv.no));

  const action = mode === 'simple' ? 'stageSimple' : mode === 'supplierSafe' ? 'supplierInvoiceDetail' : 'invoiceDetail';
  const rowTitle = mode === 'simple' ? 'Click to see current stage' : mode === 'supplierSafe' ? (isSupplierUser ? 'Click to view invoice progress' : 'Click for supplier-facing status') : 'Click for full stage-by-stage status';

  const openInvoice    = (no, poItem, inv = {}) => {
    if (isSupplierUser && mode === 'supplierSafe') {
      // keep the page's filters in the URL so "← All Invoices" returns to the same list
      const next = new URLSearchParams(searchParams);
      next.set('open', no);
      if (poItem !== undefined && poItem !== '') next.set('item', String(poItem)); else next.delete('item');
      if (inv.sourceId) next.set('source_id', inv.sourceId); else next.delete('source_id');
      navigate({ pathname: '/supplier/home', search: next.toString() });
      return;
    }
    dispatch(openModal({ kind: action, ctx: { no, poItem, vcode: inv.vcode, po: inv.po, channel: inv.channel, sourceId: inv.sourceId } }));
  };
  const openVendorCode = (code) => dispatch(openModal({ kind: 'vendorCodePreview', ctx: { code } }));
  const openRaiseTicket= (no, poItem, inv = {}) => dispatch(openModal({ kind: 'raiseTicket', ctx: { no, poItem, sourceId: inv.sourceId, channel: inv.channel } }));

  // Suppliers see one vendor code, so vendor columns are noise.
  const supplierView = mode === 'supplierSafe' && isSupplierUser;
  const colCount = (bulk ? 1 : 0) + (supplierView ? 12 : 19);
  const exportCount = filteredCount ?? filtered.length;
  const exportLabel = `Export to Excel (${exportCount})`;
  const portalExportNames = { msetuSrm: 'Msetu_SRM', poPortal: 'PO_Portal', mfoxPortal: 'MFOX' };
  const channelKey = tableKey.match(/^channel-(msetuSrm|poPortal|mfoxPortal)(?:-|$)/)?.[1];
  const regularExportName = exportName || portalExportNames[channelKey] || 'Invoices';

  const exportCols = supplierView
    ? ['Invoice No', 'Channel', 'PO No', 'Product Type', 'Invoice Date', 'Payment Due Date', 'Amount', 'Status', 'Current Stage', 'UTR No', 'Status Date', 'Rejection Reason']
    : ['Invoice No', 'Vendor', 'Vendor Code', 'Channel', 'PO No', 'PO Item', 'Product Type', 'Plant Code', 'Division', 'Invoice Date', 'Upload Date', 'Payment Due Date', 'Amount', 'Status', 'Pending With', 'UTR No', 'Status Date', 'Rejection Reason'];
  const toExportRow = (inv) => {
    if (supplierView) return [inv.no, CHANNEL_LABEL[inv.channel], inv.po, invoiceProductType(inv), invoiceDateLabel(inv), formatInvoiceDate(inv.sap?.net_due_date), inv.amount, inv.status, currentStageName(inv), inv.utr, inv.date, inv.status === 'Rejected' ? (inv.rejectionReason || inv.workflow?.rejection_reason || inv.shortPayReason || 'Not provided') : ''];
    return [inv.no, inv.vendor, inv.vcode, CHANNEL_LABEL[inv.channel], inv.po, poItemValue(inv), invoiceProductType(inv), inv.plant || '-', inv.dvType || '-', invoiceDateLabel(inv), formatInvoiceDate(inv.rawUploadDate), formatInvoiceDate(inv.sap?.net_due_date), inv.amount, inv.status, inv.workflow?.pending_with || '-', inv.utr, inv.date, rejectionReason(inv)];
  };
  const exportInvoices = (list, isSelected = false) => {
    const filename = timestampedExportName(isSelected ? 'Selected_Invoices' : regularExportName);
    downloadCSV(filename, exportCols, list.map(toExportRow));
    dispatch(pushToast(`Exported ${list.length} invoice${list.length === 1 ? '' : 's'} to Excel.`));
  };

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-left">
          {lead}
          {!hideSearch && (
            <div style={{ position: 'relative', width: 'clamp(16.25rem, 34vw, 26.25rem)' }}>
              <Search
                size={14}
                style={{ position: 'absolute', left: '0.6875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
              />
              <input
                className="search-box"
                style={{ width: '100%', paddingLeft: '2rem', paddingRight: search ? '1.875rem' : '0.75rem', fontSize: '0.8125rem' }}
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
                  style={{ position: 'absolute', right: '0.4375rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.0625rem', lineHeight: 1, padding: '0 0.25rem' }}
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
                title={`Export ${selected.length} selected invoice(s) to Excel`}
                onClick={() => {
                  exportInvoices(invoices.filter((inv) => selected.includes(inv.no)), true);
                  dispatch(clearSelection(tableKey));
                }}>
                <Download />Export Selected to Excel
              </button>
            </>
          ) : (
            <button type="button" className="btn"
              title={`Export the ${exportCount} currently filtered invoice(s) to Excel`}
              onClick={() => exportInvoices(filtered)}>
              <Download />{exportLabel}
            </button>
          )}
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table invoice-list-table">
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
              {!supplierView && <th scope="col" style={{ ...stickyCell((bulk ? CHECK_COL_W : 0) + INVOICE_COL_W, true), minWidth: '8.75rem' }}>Vendor</th>}

              {!supplierView && <th scope="col">Vendor Code</th>}
              <th scope="col">Channel</th>
              <th scope="col">PO No</th>
              {!supplierView && <th scope="col">PO Item</th>}
              <th scope="col">Product Type</th>
              {!supplierView && <th scope="col">Plant Code</th>}
              {!supplierView && <th scope="col">Division</th>}
              <SortDateTh label="Invoice Date" dir={dirFor('invoice')} onToggle={() => toggleDate('invoice')} title="Source invoice date used by the date filters" />
              {!supplierView && <SortDateTh label="Upload Date" dir={dirFor('upload')} onToggle={() => toggleDate('upload')} />}
              <SortDateTh label="Payment Due Date" dir={dirFor('due')} onToggle={() => toggleDate('due')} />
              <th scope="col" className="num">Amount</th>
              <th scope="col">Status</th>
              {supplierView && <th scope="col">Current Stage</th>}
              {!supplierView && <th scope="col">Pending With</th>}
              <th scope="col">UTR No</th>
              <SortDateTh label="Status Date" className="invoice-status-date" dir={dirFor('status')} onToggle={() => toggleDate('status')} />
              {!supplierView && <th scope="col">Rejection Reason</th>}
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
                    <button type="button" className="link-hero" title={rowTitle} onClick={() => openInvoice(inv.no, inv.poItem, inv)}>
                      {inv.no}
                    </button>
                  </td>

                  {/* Sticky: Vendor */}
                  {!supplierView && (
                    <td style={{ ...stickyCell((bulk ? CHECK_COL_W : 0) + INVOICE_COL_W), whiteSpace: 'normal', minWidth: '8.75rem', maxWidth: '12.5rem' }}>
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
                  {!supplierView && <td>{poItemValue(inv)}</td>}
                  <td>{invoiceProductType(inv)}</td>
                  {!supplierView && <td>{inv.plant || '-'}</td>}
                  {!supplierView && <td>{inv.dvType || '-'}</td>}
                  <td className="cell-muted" style={{ whiteSpace: 'nowrap' }}>{invoiceDateLabel(inv)}</td>
                  {!supplierView && <td className="cell-muted" style={{ whiteSpace: 'nowrap' }}>{formatInvoiceDate(inv.rawUploadDate)}</td>}
                  <td className="cell-muted" style={{ whiteSpace: 'nowrap' }}>{formatInvoiceDate(inv.sap?.net_due_date)}</td>
                  <td className="num mono">{inv.amount}</td>
                  <td>
                    <Badge tone={STATUS_CHIP[inv.status] || 'gray'}>{inv.status}</Badge>
                    {supplierView && inv.status === 'Rejected' && <div style={{ marginTop: '0.375rem', color: 'var(--brand-dark)', whiteSpace: 'normal', minWidth: '10rem' }}>
                      <strong>Rejection reason:</strong> {inv.rejectionReason || inv.workflow?.rejection_reason || inv.shortPayReason || 'Not provided'}
                    </div>}
                  </td>
                  {supplierView && <td className="cell-muted" style={{ whiteSpace: 'normal', minWidth: '9.375rem' }}>{currentStageName(inv)}</td>}
                  {!supplierView && <td style={{ whiteSpace: 'normal', minWidth: '9rem' }}>{inv.workflow?.pending_with || '-'}</td>}
                  <td>{inv.utr === '-' ? <span className="cell-dim">Not yet visible</span> : inv.utr}</td>
                  <td className="cell-muted invoice-status-date">{inv.date}</td>
                  {!supplierView && <td style={{ whiteSpace: 'normal', minWidth: '10rem', color: inv.status === 'Rejected' ? 'var(--brand-dark)' : undefined }}>{rejectionReason(inv)}</td>}

                  <td className="col-actions">
                    <div className="row-actions">
                      {isSupplierUser && (
                        <button
                          type="button" className="kebab"
                          title="Raise a query on this invoice"
                          aria-label={`Raise query for invoice ${inv.no}`}
                          onClick={() => openRaiseTicket(inv.no, inv.poItem, inv)}
                        ><Flag /></button>
                      )}
                      <button
                        type="button" className="kebab"
                        title={rowTitle}
                        aria-label={`View details for invoice ${inv.no}`}
                        onClick={() => openInvoice(inv.no, inv.poItem, inv)}
                      ><Eye /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {amountSummary && (
        <div role="status" aria-label="Filtered invoice amount" className="filtered-invoice-amount">
          <div>
            <div style={{ fontWeight: 600 }}>Filtered Invoice Amount</div>
            <div className="cell-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
              {filtered.length.toLocaleString()} matching invoice{filtered.length === 1 ? '' : 's'} across all pages
              {amountSummary.known < filtered.length && ` · Amount available for ${amountSummary.known} of ${filtered.length} invoices`}
            </div>
          </div>
          <strong style={{ fontSize: '1.1875rem', fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{amountSummary.value}</strong>
        </div>
      )}
      <PagerFoot
        total={filtered.length}
        page={currentPage}
        pageSize={PAGE_SIZE}
        onPage={(p) => dispatch(setTablePage({ key: tableKey, page: p }))}
      />
    </div>
  );
}
