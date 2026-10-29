import { useDispatch, useSelector } from 'react-redux';
import { CHANNEL_STAGES, CHANNEL_LABEL, CHANNEL_ROUTING_RULE, STATUS_CHIP } from '../../data/constants';
import { stageProgress, handlerFor, findInvoice } from '../../utils/businessLogic';
import PoPortalDetails from '../invoices/PoPortalDetails.jsx';
import { closeModal } from '../../features/ui/uiSlice';
import { selectScopedInvoices } from '../../features/invoices/selectors';
import ModalShell from './ModalShell.jsx';
import Badge from '../common/Badge.jsx';
import { invoiceDateLabel } from '../../utils/invoiceDates';

function displayDate(value) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function InvoiceDetailModal({ ctx }) {
  const dispatch = useDispatch();
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
      width={600}
      foot={<button type="button" className="btn" onClick={() => dispatch(closeModal())}>Close</button>}
    >
      <div className="row" style={{ marginBottom: '1rem' }}>
        <div className="form-field" style={{ flex: 1 }}><label>Vendor</label><input value={inv.vendor} readOnly /></div>
        <div className="form-field" style={{ flex: 1 }}><label>Vendor Code</label><input value={inv.vcode} readOnly /></div>
      </div>
      <div className="row" style={{ marginBottom: '1rem' }}>
        <div className="form-field" style={{ flex: 1 }}><label>Channel</label><input value={CHANNEL_LABEL[inv.channel]} readOnly /></div>
        <div className="form-field" style={{ flex: 1 }}><label>PO No</label><input value={inv.po} readOnly /></div>
        <div className="form-field" style={{ flex: 1 }}><label>Amount</label><input value={inv.amount} readOnly /></div>
      </div>
      <p style={{ fontSize: '0.71875rem', color: 'var(--text-muted)', margin: '-0.625rem 0 1rem' }}>Why this channel: {CHANNEL_ROUTING_RULE[inv.channel]}</p>

      {authType !== 'supplier' && (
        <>
          <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Currently Handled By</label>
          <div className="row" style={{ margin: '0.5rem 0 1rem' }}>
            <div className="form-field" style={{ flex: 1 }}><label>Approver</label><input value={`${h.approver} · ${h.approverEmail}`} readOnly /></div>
            <div className="form-field" style={{ flex: 1 }}><label>Accounts</label><input value={bookedOrLater ? `${h.accounts} · ${h.accountsEmail}` : 'Not yet assigned'} readOnly /></div>
          </div>
        </>
      )}


      <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Invoice Progress</label>
      <div style={{ margin: '0.625rem 0 1.125rem' }}>
        {stages.map((s, i) => {
          const idx = i + 1;
          const st = failed && idx >= done ? 'fail' : idx < done || (idx === done && inv.status === 'Paid') ? 'done' : idx === done ? 'current' : 'todo';
          const dotBg = st === 'fail' ? 'var(--red)' : st === 'done' ? 'var(--green)' : st === 'current' ? 'var(--blue)' : '#E2E8F0';
          const dotFg = st === 'todo' ? 'var(--text-muted)' : '#fff';
          const txtColor = st === 'todo' ? 'var(--text-muted)' : 'var(--text)';
          const dateStr = getStageDate(s);
          return (
            <div style={{ display: 'flex', gap: '0.625rem' }} key={i}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '1.375rem', height: '1.375rem', borderRadius: '50%', background: dotBg, color: dotFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6875rem', fontWeight: 700, flexShrink: 0 }}>
                  {st === 'done' ? '✓' : st === 'fail' ? '✕' : idx}
                </div>
                {i < stages.length - 1 && <div style={{ width: '0.125rem', flex: 1, minHeight: '0.875rem', background: idx < done ? 'var(--blue)' : '#E2E8F0' }} />}
              </div>
              <div style={{ paddingBottom: '0.875rem', paddingTop: '0.0625rem' }}>
                <div style={{ fontSize: '0.78125rem', fontWeight: st === 'current' ? 700 : 500, color: txtColor }}>{s}</div>
                {st === 'current' && <div style={{ fontSize: '0.6875rem', color: 'var(--blue)', marginTop: '0.125rem' }}>In progress</div>}
                {dateStr && <div style={{ fontSize: '0.71875rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>{dateStr}</div>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="validation-row"><span>Current Status</span><Badge tone={STATUS_CHIP[inv.status] || 'gray'}>{inv.status}</Badge></div>
      <div className="validation-row"><span>UTR No.</span><span>{inv.utr === '-' ? <span style={{ color: '#CBD5E1' }}>Not yet visible</span> : inv.utr}</span></div>
      <PoPortalDetails invoice={inv} internal={authType !== 'supplier'} />
      {inv.shortPayReason && <div className="validation-row"><span>Short-Payment Reason</span><span style={{ textAlign: 'right', maxWidth: '17.5rem' }}>{inv.shortPayReason}</span></div>}
      <div className="validation-row"><span>Invoice Date</span><span>{invoiceDateLabel(inv)}</span></div>
      <div className="validation-row"><span>Upload Date</span><span>{displayDate(inv.rawUploadDate) || '-'}</span></div>
      <div className="validation-row"><span>Payment Due Date</span><span>{displayDate(inv.sap?.net_due_date) || '-'}</span></div>
      <div className="validation-row"><span>Payment Date</span><span>{displayDate(inv.sap?.clearing_date) || '-'}</span></div>
    </ModalShell>
  );
}




