import { useDispatch, useSelector } from 'react-redux';
import { CHANNEL_LABEL, CHANNEL_ROUTING_RULE, STATUS_CHIP } from '../../data/constants';
import { handlerFor, findInvoice } from '../../utils/businessLogic';
import PoPortalDetails from '../invoices/PoPortalDetails.jsx';
import { closeModal } from '../../features/ui/uiSlice';
import { selectScopedInvoices } from '../../features/invoices/selectors';
import ModalShell from './ModalShell.jsx';
import { useLocation } from 'react-router-dom';
import { Breadcrumb } from '../layout/Breadcrumb.jsx';
import { shortPageTitle } from '../../utils/pageTitle';
import Badge from '../common/Badge.jsx';
import { Check, HelpCircle, X } from '../common/icons.jsx';
import { invoiceDateLabel } from '../../utils/invoiceDates';

function displayDate(value) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const known = (value) => (value && value !== '-' ? value : '');

/** One person handling the invoice: initials, role, name and e-mail (or "Not assigned"). */
function Handler({ role, name, email }) {
  const who = known(name);
  const initials = who.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
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
  useSelector((s) => s.ui.dataVersion); // re-render when invoice data refreshes
  const authType = useSelector((s) => s.auth.authType);
  const invoices = useSelector(selectScopedInvoices);
  const inv = findInvoice(ctx.no, ctx.poItem, invoices, ctx);
  if (!inv) return null;

  const stages = ['Initial', 'Invoice Uploaded', 'Pending for Approval', 'Approved', 'Miro Booked', 'Paid'];
  const currentIndex = stages.indexOf(['Pending Approval', 'Level Approved', 'Action Required'].includes(inv.status) ? 'Pending for Approval' : inv.status);
  const failed = inv.status === 'Rejected' || ['Deleted', 'Entry Deleted'].includes(inv.status);
  const done = failed ? 1 : (currentIndex >= 0 ? currentIndex + 1 : 1);
  const h = handlerFor(inv);
  const bookedOrLater = done >= Math.ceil(stages.length * 0.7) || inv.status === 'Paid';

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

      <h4 className="inv-section-title">Status &amp; payment</h4>
      <div className="detail-grid">
        <Detail label="Current Status"><Badge tone={STATUS_CHIP[inv.status] || 'gray'}>{inv.status}</Badge></Detail>
        <Detail label="UTR No.">{inv.utr === '-' ? <span className="detail-empty">Not yet visible</span> : inv.utr}</Detail>
        {inv.shortPayReason && <Detail label="Short-Payment Reason">{inv.shortPayReason}</Detail>}
      </div>

      <h4 className="inv-section-title">Dates</h4>
      <div className="detail-grid">
        <Detail label="Invoice Date">{invoiceDateLabel(inv)}</Detail>
        <Detail label="Upload Date">{displayDate(inv.rawUploadDate) || '-'}</Detail>
        <Detail label="Payment Due Date">{displayDate(inv.sap?.net_due_date) || '-'}</Detail>
        <Detail label="Payment Date">{displayDate(inv.sap?.clearing_date) || '-'}</Detail>
      </div>

      <PoPortalDetails invoice={inv} internal={authType !== 'supplier'} />
    </ModalShell>
  );
}
