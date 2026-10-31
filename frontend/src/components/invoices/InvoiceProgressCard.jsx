import { useDispatch } from 'react-redux';
import { CHANNEL_LABEL } from '../../data/constants';
import { combinedStatusFor, invoiceProductType } from '../../utils/businessLogic';
import { formatInvoiceDate } from '../../utils/invoiceDates';
import { openModal } from '../../features/ui/uiSlice';
import { Check, Eye, MessageSquare, X } from '../common/icons.jsx';

function displayDate(value) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const LADDER = ['Initial', 'Invoice Uploaded', 'Pending for Approval', 'Approved', 'Miro Booked', 'Paid'];

export default function InvoiceProgressCard({ inv }) {
  const dispatch = useDispatch();
  const identity = { no: inv.no, poItem: inv.poItem, vcode: inv.vcode, po: inv.po, channel: inv.channel, sourceId: inv.sourceId };
  const stages = LADDER;
  const currentIndex = stages.indexOf(['Pending Approval', 'Level Approved', 'Action Required'].includes(inv.status) ? 'Pending for Approval' : inv.status);
  // A rejected invoice stopped at the approval step; a deleted one never got past upload.
  const failed = inv.status === 'Rejected' || ['Deleted', 'Entry Deleted'].includes(inv.status);
  const done = failed ? (inv.status === 'Rejected' ? 2 : 1) : (currentIndex >= 0 ? currentIndex + 1 : 1);
  const cs = combinedStatusFor(inv);
  const failureNote = inv.rejectionReason || inv.workflow?.rejection_reason || inv.shortPayReason
    || (['Deleted', 'Entry Deleted'].includes(inv.status) ? 'This invoice was deleted and will not be processed further.' : 'This invoice was rejected and will not be processed further.');

  const getStageDate = (stage) => {
    switch (stage) {
      case 'Initial':
        return displayDate(inv.rawDate);
      case 'Invoice Uploaded':
        return displayDate(inv.rawUploadDate);
      case 'Pending for Approval':
        return null;
      case 'Approved':
        return displayDate(inv.workflow?.final_approval_date);
      case 'Miro Booked':
        return displayDate(inv.sap?.miro_booking_date || inv.sap?.document_date);
      case 'Payment Due':
        return displayDate(inv.sap?.net_due_date);
      case 'Paid':
        return inv.utr && inv.utr !== '-' ? `${displayDate(inv.sap?.clearing_date) || '-'} (${inv.utr})` : displayDate(inv.sap?.clearing_date);
      default:
        return null;
    }
  };

  const item = (label, value) => <div className="detail-item"><span>{label}</span><span>{value}</span></div>;

  return (
    <section className="card progress-card">
      <div className="progress-card-head">
        <div className="progress-card-id">
          <button type="button" className="link-hero" onClick={() => dispatch(openModal({ kind: 'supplierInvoiceDetail', ctx: identity }))}>{inv.no}</button>
          <div className="progress-card-meta">
            <span className="inv-channel-tag">{CHANNEL_LABEL[inv.channel]}</span>
            <span>PO {inv.po}</span>
          </div>
        </div>
        <div className="progress-card-side">
          <span className={`chip ${cs.tone}`}>{cs.label}</span>
          {inv.amount && inv.amount !== '-' && <strong className="progress-card-amount">{inv.amount}</strong>}
        </div>
      </div>
      <h4 className="inv-section-title">Invoice Progress</h4>
      <ol className="inv-stepper">
        {stages.map((s, i) => {
          const idx = i + 1;
          const st = failed && idx >= done ? 'fail' : idx < done || (idx === done && inv.status === 'Paid') ? 'done' : idx === done ? 'current' : 'todo';
          const dateStr = getStageDate(s);
          return (
            <li className={`inv-step ${st}`} key={s}>
              <span className="inv-step-dot" aria-hidden="true">
                {st === 'done' ? <Check size={12} /> : st === 'fail' ? <X size={12} /> : idx}
              </span>
              <span className="inv-step-text">
                <span className="inv-step-name">{s}</span>
                {st === 'current' && <span className="inv-step-state">In progress</span>}
                {dateStr && <span className="inv-step-date">{dateStr}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {failed && (
        <div role="alert" className="progress-card-alert">
          <b>{inv.status === 'Rejected' ? 'Rejection reason' : inv.status}</b> · {failureNote}
        </div>
      )}
      <h4 className="inv-section-title">Details &amp; payment</h4>
      <div className="detail-grid">
        {item('Product Type', invoiceProductType(inv))}
        {item('PO Item', inv.poItem === '' || inv.poItem == null ? '-' : inv.poItem)}
        {item('Payment Due Date', formatInvoiceDate(inv.sap?.net_due_date))}
        {item('Payment Date', formatInvoiceDate(inv.sap?.clearing_date))}
        {item('UTR No.', inv.utr === '-' ? <span className="detail-empty">Not yet visible</span> : inv.utr)}
        {inv.shortPayReason && !inv.rejectionReason && !inv.workflow?.rejection_reason && !failed && item('Reason for Less Paid', inv.shortPayReason)}
      </div>
      <div className="progress-card-actions">
        <button type="button" className="btn primary" onClick={() => dispatch(openModal({ kind: 'raiseTicket', ctx: identity }))}><MessageSquare size={14} />Raise a Query</button>
        <button type="button" className="btn" onClick={() => dispatch(openModal({ kind: 'supplierInvoiceDetail', ctx: identity }))}><Eye size={14} />View Full Detail</button>
      </div>
    </section>
  );
}
