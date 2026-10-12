import { useDispatch } from 'react-redux';
import { CHANNEL_LABEL } from '../../data/constants';
import { combinedStatusFor } from '../../utils/businessLogic';
import { openModal } from '../../features/ui/uiSlice';

function displayDate(value) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const LADDER = ['Invoice Uploaded', 'Pending Approval', 'Approved', 'Miro Booked', 'Payment Due', 'Paid'];

export default function InvoiceProgressCard({ inv }) {
  const dispatch = useDispatch();
  const stages = LADDER;
  const currentIndex = stages.indexOf(inv.status);
  // A rejected invoice stopped at the approval step; a deleted one never got past upload.
  const failed = inv.status === 'Rejected' || inv.status === 'Deleted';
  const done = failed ? (inv.status === 'Rejected' ? 2 : 1) : (currentIndex >= 0 ? currentIndex + 1 : 1);
  const cs = combinedStatusFor(inv);
  const failureNote = inv.shortPayReason
    || (inv.status === 'Deleted' ? 'This invoice was deleted and will not be processed further.' : 'This invoice was rejected and will not be processed further.');

  const getStageDate = (stage) => {
    switch (stage) {
      case 'Invoice Uploaded':
        return displayDate(inv.rawDate);
      case 'Pending Approval':
        return null;
      case 'Approved':
        return displayDate(inv.workflow?.final_approval_date);
      case 'Miro Booked':
        return displayDate(inv.sap?.document_date || inv.sap?.posting_date);
      case 'Payment Due':
        return displayDate(inv.sap?.net_due_date);
      case 'Paid':
        return inv.utr && inv.utr !== '-' ? `${displayDate(inv.sap?.clearing_date)} (${inv.utr})` : displayDate(inv.sap?.clearing_date);
      default:
        return null;
    }
  };

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <div>
          <button type="button" className="link-hero" style={{ fontSize: 15 }} onClick={() => dispatch(openModal({ kind: 'supplierInvoiceDetail', ctx: { no: inv.no, poItem: inv.poItem } }))}>{inv.no}</button>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{CHANNEL_LABEL[inv.channel]} : PO {inv.po} : {inv.amount}</div>
        </div>
        <span className={`chip ${cs.tone}`}>{cs.label}</span>
      </div>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Invoice Progress</label>
      <div style={{ display: 'flex', alignItems: 'flex-start', margin: '10px 0 4px', overflowX: 'auto' }}>
        {stages.map((s, i) => {
          const idx = i + 1;
          const st = idx < done || (idx === done && inv.status === 'Paid') ? 'done' : idx === done ? 'current' : 'todo';
          const dotBg = st === 'done' ? 'var(--green)' : st === 'current' ? 'var(--blue)' : '#E2E8F0';
          const dotFg = st === 'todo' ? 'var(--text-muted)' : '#fff';
          const dateStr = getStageDate(s);
          return (
            <div key={i} style={{ flex: 1, minWidth: 88, textAlign: 'center', position: 'relative' }}>
              {i > 0 && <div style={{ position: 'absolute', top: 11, left: '-50%', width: '100%', height: 2, background: st === 'done' ? 'var(--green)' : idx <= done ? 'var(--blue)' : '#E2E8F0', zIndex: 0 }} />}
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: dotBg, color: dotFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, margin: '0 auto', position: 'relative', zIndex: 1 }}>{st === 'done' ? '✓' : idx}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.3 }}>{s}</div>
              {dateStr && <div style={{ fontSize: 9.5, color: 'var(--text)', fontWeight: 600, marginTop: 3 }}>{dateStr}</div>}
            </div>
          );
        })}
      </div>
      {failed && (
        <div role="alert" style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--brand-tint)', color: 'var(--brand-dark)', fontSize: 12.5, lineHeight: 1.4 }}>
          <b>{inv.status}</b> · {failureNote}
        </div>
      )}
      <div className="validation-row" style={{ marginTop: 10 }}><span>UTR No.</span><span>{inv.utr === '-' ? <span style={{ color: '#CBD5E1' }}>Not yet visible</span> : inv.utr}</span></div>
      {inv.shortPayReason && !failed && <div className="validation-row"><span>Reason for Less Paid</span><span style={{ textAlign: 'right', maxWidth: 280 }}>{inv.shortPayReason}</span></div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="button" className="btn" onClick={() => dispatch(openModal({ kind: 'raiseTicket', ctx: { no: inv.no, poItem: inv.poItem } }))}>Raise a Query</button>
        <button type="button" className="btn" onClick={() => dispatch(openModal({ kind: 'supplierInvoiceDetail', ctx: { no: inv.no, poItem: inv.poItem } }))}>View Full Detail</button>
      </div>
    </div>
  );
}
