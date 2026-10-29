import { useDispatch } from 'react-redux';
import { CHANNEL_LABEL } from '../../data/constants';
import { combinedStatusFor, invoiceProductType } from '../../utils/businessLogic';
import { formatInvoiceDate } from '../../utils/invoiceDates';
import { openModal } from '../../features/ui/uiSlice';

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

  return (
    <div className="card" style={{ marginBottom: '0.875rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.875rem' }}>
        <div>
          <button type="button" className="link-hero" style={{ fontSize: '0.9375rem' }} onClick={() => dispatch(openModal({ kind: 'supplierInvoiceDetail', ctx: identity }))}>{inv.no}</button>
          <div style={{ fontSize: '0.71875rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>{CHANNEL_LABEL[inv.channel]} : PO {inv.po} : {inv.amount}</div>
        </div>
        <span className={`chip ${cs.tone}`}>{cs.label}</span>
      </div>
      <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Invoice Progress</label>
      <div style={{ display: 'flex', alignItems: 'flex-start', margin: '0.625rem 0 0.25rem', overflowX: 'auto' }}>
        {stages.map((s, i) => {
          const idx = i + 1;
          const st = idx < done || (idx === done && inv.status === 'Paid') ? 'done' : idx === done ? 'current' : 'todo';
          const dotBg = st === 'done' ? 'var(--green)' : st === 'current' ? 'var(--blue)' : '#E2E8F0';
          const dotFg = st === 'todo' ? 'var(--text-muted)' : '#fff';
          const dateStr = getStageDate(s);
          return (
            <div key={i} style={{ flex: 1, minWidth: '5.5rem', textAlign: 'center', position: 'relative' }}>
              {i > 0 && <div style={{ position: 'absolute', top: '0.6875rem', left: '-50%', width: '100%', height: '0.125rem', background: st === 'done' ? 'var(--green)' : idx <= done ? 'var(--blue)' : '#E2E8F0', zIndex: 0 }} />}
              <div style={{ width: '1.375rem', height: '1.375rem', borderRadius: '50%', background: dotBg, color: dotFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6875rem', fontWeight: 700, margin: '0 auto', position: 'relative', zIndex: 1 }}>{st === 'done' ? '✓' : idx}</div>
              <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', marginTop: '0.3125rem', lineHeight: 1.3 }}>{s}</div>
              {dateStr && <div style={{ fontSize: '0.59375rem', color: 'var(--text)', fontWeight: 600, marginTop: '0.1875rem' }}>{dateStr}</div>}
            </div>
          );
        })}
      </div>
      {failed && (
        <div role="alert" style={{ marginTop: '0.625rem', padding: '0.625rem 0.75rem', borderRadius: '0.5rem', background: 'var(--brand-tint)', color: 'var(--brand-dark)', fontSize: '0.78125rem', lineHeight: 1.4 }}>
          <b>{inv.status === 'Rejected' ? 'Rejection reason' : inv.status}</b> · {failureNote}
        </div>
      )}
      <div className="validation-row" style={{ marginTop: '0.625rem' }}><span>Product Type</span><span>{invoiceProductType(inv)}</span></div>
      <div className="validation-row"><span>PO Item</span><span>{inv.poItem === '' || inv.poItem == null ? '-' : inv.poItem}</span></div>
      <div className="validation-row"><span>Payment Due Date</span><span>{formatInvoiceDate(inv.sap?.net_due_date)}</span></div>
      <div className="validation-row"><span>Payment Date</span><span>{formatInvoiceDate(inv.sap?.clearing_date)}</span></div>
      <div className="validation-row"><span>UTR No.</span><span>{inv.utr === '-' ? <span style={{ color: '#CBD5E1' }}>Not yet visible</span> : inv.utr}</span></div>
      {inv.shortPayReason && !inv.rejectionReason && !inv.workflow?.rejection_reason && !failed && <div className="validation-row"><span>Reason for Less Paid</span><span style={{ textAlign: 'right', maxWidth: '17.5rem' }}>{inv.shortPayReason}</span></div>}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <button type="button" className="btn" onClick={() => dispatch(openModal({ kind: 'raiseTicket', ctx: identity }))}>Raise a Query</button>
        <button type="button" className="btn" onClick={() => dispatch(openModal({ kind: 'supplierInvoiceDetail', ctx: identity }))}>View Full Detail</button>
      </div>
    </div>
  );
}
