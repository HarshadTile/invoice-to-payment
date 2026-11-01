import { useDispatch } from 'react-redux';
import { CHANNEL_LABEL } from '../../data/constants';
import { combinedStatusFor, invoiceProductType } from '../../features/invoices/invoice';
import { formatInvoiceDate } from '../../utils/invoiceDates';
import { openModal } from '../../features/ui/uiSlice';
import { isDeleted, isFailed } from '../../features/invoices/progress';
import InvoiceStepper from './InvoiceStepper.jsx';
import { Eye, MessageSquare } from '../common/icons.jsx';

export default function InvoiceProgressCard({ inv }) {
  const dispatch = useDispatch();
  const identity = { no: inv.no, poItem: inv.poItem, vcode: inv.vcode, po: inv.po, channel: inv.channel, sourceId: inv.sourceId };
  const failed = isFailed(inv);
  const cs = combinedStatusFor(inv);
  const failureNote = inv.rejectionReason || inv.workflow?.rejection_reason || inv.shortPayReason
    || (isDeleted(inv) ? 'This invoice was deleted and will not be processed further.' : 'This invoice was rejected and will not be processed further.');

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
      <InvoiceStepper inv={inv} />
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
