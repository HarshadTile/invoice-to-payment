import { useDispatch } from 'react-redux';
import { CHANNEL_LABEL, STATUS_CHIP } from '../../data/constants';
import { openModal } from '../../features/ui/uiSlice';
import Badge from '../common/Badge.jsx';
import SortDateTh from '../common/SortDateTh.jsx';
import { useDateColumnSort } from '../../utils/dateSort';
import { invoiceDateLabel } from '../../utils/invoiceDates';
import { Eye, Inbox } from '../common/icons.jsx';

/**
 * Compact, read-only "recent invoices" list for the dashboard.
 * `rows` is already sliced/ordered by the server (or the page) — this component
 * renders a fixed number of rows and never paginates or filters.
 */
const DATE_COLUMNS = { invoice: (inv) => inv.rawDate, status: (inv) => inv.date };

export default function RecentInvoices({ rows = [] }) {
  const dispatch = useDispatch();
  const { sorted, toggle, dirFor } = useDateColumnSort(rows, DATE_COLUMNS);
  const openStage = (no, poItem) => dispatch(openModal({ kind: 'stageSimple', ctx: { no, poItem } }));
  const openVendorCode = (code) => dispatch(openModal({ kind: 'vendorCodePreview', ctx: { code } }));

  return (
    <div className="recent-invoices">
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Invoice No</th>
              <SortDateTh label="Invoice Date" dir={dirFor('invoice')} onToggle={() => toggle('invoice')} />
              <th scope="col">Vendor Code</th>
              <th scope="col">Channel</th>
              <th scope="col" className="num">Amount</th>
              <th scope="col">Status</th>
              <SortDateTh label="Status Date" dir={dirFor('status')} onToggle={() => toggle('status')} />
              <th scope="col" className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8}>
                <div className="empty-state"><Inbox /><b>No invoices yet</b><span>New invoices will appear here.</span></div>
              </td></tr>
            )}
            {sorted.map((inv, rowIndex) => (
              <tr key={`${inv.no}-${rowIndex}`}>
                <td><button type="button" className="link-hero" title="Open current stage" onClick={() => openStage(inv.no, inv.poItem)}>{inv.no}</button></td>
                <td className="cell-muted" style={{ whiteSpace: 'nowrap' }}>{invoiceDateLabel(inv)}</td>
                <td><button type="button" className="vcode-chip link-hero" title={`Preview ${inv.vcode}`} onClick={() => openVendorCode(inv.vcode)}>{inv.vcode}</button></td>
                <td className="cell-muted">{CHANNEL_LABEL[inv.channel]}</td>
                <td className="num mono">{inv.amount}</td>
                <td><Badge tone={STATUS_CHIP[inv.status] || 'gray'}>{inv.status}</Badge></td>
                <td className="cell-muted">{inv.date}</td>
                <td className="col-actions">
                  <div className="row-actions">
                    <button type="button" className="kebab" title="Open current stage" aria-label="View invoice" onClick={() => openStage(inv.no, inv.poItem)}><Eye /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
