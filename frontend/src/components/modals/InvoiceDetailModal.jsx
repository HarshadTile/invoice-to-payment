import { useDispatch, useSelector } from 'react-redux';
import { CHANNEL_LABEL, CHANNEL_ROUTING_RULE, STATUS_CHIP } from '../../data/constants';
import { handlerFor } from '../../features/invoices/invoice';
import { useInvoice } from '../../features/invoices/useInvoice';
import InvoiceLoading from './InvoiceLoading.jsx';
import PoPortalDetails from '../invoices/PoPortalDetails.jsx';
import { closeModal } from '../../features/ui/uiSlice';
import ModalShell from './ModalShell.jsx';
import { useLocation } from 'react-router-dom';
import { Breadcrumb } from '../layout/Breadcrumb.jsx';
import { shortPageTitle } from '../../utils/pageTitle';
import Badge from '../common/Badge.jsx';
import { HelpCircle } from '../common/icons.jsx';
import InvoiceStepper from '../invoices/InvoiceStepper.jsx';
import { formatInvoiceDate, invoiceDateLabel } from '../../utils/invoiceDates';
import { initialsOf } from '../../utils/initials';

const known = (value) => (value && value !== '-' ? value : '');

/** One person handling the invoice: initials, role, name and e-mail (or "Not assigned"). */
function Handler({ role, name, email }) {
  const who = known(name);
  const initials = initialsOf(who);
  return <div className={`handler-card${who ? '' : ' empty'}`}>
    <span className="handler-avatar" aria-hidden="true">{initials || '–'}</span>
    <span className="handler-who">
      <span className="handler-role">{role}</span>
      <span className="handler-name">{who || 'Not assigned'}</span>
      {who && known(email) && <span className="handler-email">{email}</span>}
    </span>
  </div>;
}

function Detail({ label, children }) {
  return <div className="detail-item"><span>{label}</span><span>{children}</span></div>;
}

export default function InvoiceDetailModal({ ctx }) {
  const dispatch = useDispatch();
  const { pathname } = useLocation();
  const authType = useSelector((s) => s.auth.authType);
  const lookup = useInvoice(ctx);
  const inv = lookup.inv;
  if (!inv) return <InvoiceLoading lookup={lookup} title={ctx.no} width={760} />;

  const h = handlerFor(inv);
  // Accounts only owns the invoice once it is booked in SAP
  const bookedOrLater = ['Miro Booked', 'Paid'].includes(inv.status);

  return (
    <ModalShell
      title={inv.no}
      width={760}
      className="invoice-detail-modal"
      foot={<button type="button" className="btn" onClick={() => dispatch(closeModal())}>Close</button>}
    >
      <Breadcrumb parent={shortPageTitle(pathname)} current="Invoice Details" onBack={() => dispatch(closeModal())} />
      {/* Summary: who, which PO, how much, and where it stands */}
      <section className="inv-hero">
        <div className="inv-hero-main">
          <div className="inv-hero-tags">
            <Badge tone={STATUS_CHIP[inv.status] || 'gray'}>{inv.status}</Badge>
            <span className="inv-channel-tag">{CHANNEL_LABEL[inv.channel]}</span>
          </div>
          <div className="inv-hero-vendor">{inv.vendor}</div>
          <div className="inv-hero-meta">
            <span><small>Vendor Code</small>{inv.vcode}</span>
            <span><small>PO No</small>{inv.po}</span>
          </div>
        </div>
        <div className="inv-hero-amount">
          <small>Amount</small>
          <strong>{known(inv.amount) || '—'}</strong>
        </div>
      </section>
      {CHANNEL_ROUTING_RULE[inv.channel] && (
        <p className="inv-why"><HelpCircle size={13} />Why this channel: {CHANNEL_ROUTING_RULE[inv.channel]}</p>
      )}

      {authType !== 'supplier' && (
        <>
          <h4 className="inv-section-title">Currently Handled By</h4>
          <div className="handler-grid">
            <Handler role="Approver" name={h.approver} email={h.approverEmail} />
            <Handler role="Accounts" name={bookedOrLater ? h.accounts : ''} email={h.accountsEmail} />
          </div>
        </>
      )}

      <h4 className="inv-section-title">Invoice Progress</h4>
      <InvoiceStepper inv={inv} />

      <h4 className="inv-section-title">Status &amp; payment</h4>
      <div className="detail-grid">
        <Detail label="Current Status"><Badge tone={STATUS_CHIP[inv.status] || 'gray'}>{inv.status}</Badge></Detail>
        <Detail label="UTR No.">{inv.utr === '-' ? <span className="detail-empty">Not yet visible</span> : inv.utr}</Detail>
        {inv.shortPayReason && <Detail label="Short-Payment Reason">{inv.shortPayReason}</Detail>}
      </div>

      <h4 className="inv-section-title">Dates</h4>
      <div className="detail-grid">
        <Detail label="Invoice Date">{invoiceDateLabel(inv)}</Detail>
        <Detail label="Upload Date">{formatInvoiceDate(inv.rawUploadDate)}</Detail>
        <Detail label="Payment Due Date">{formatInvoiceDate(inv.sap?.net_due_date)}</Detail>
        <Detail label="Payment Date">{formatInvoiceDate(inv.sap?.clearing_date)}</Detail>
      </div>

      <PoPortalDetails invoice={inv} internal={authType !== 'supplier'} />
    </ModalShell>
  );
}
