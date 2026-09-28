import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { runtime } from '../../data/runtime';
import { CHANNEL_STAGES, CHANNEL_LABEL, CHANNEL_ROUTING_RULE, STATUS_CHIP } from '../../data/constants';
import { stageProgress, handlerFor } from '../../utils/businessLogic';
import { closeModal, openModal, pushToast } from '../../features/ui/uiSlice';
import { selectPerm } from '../../features/auth/authSlice';
import { selectScopedInvoices } from '../../features/invoices/selectors';
import { moveInvoice, nextStatusFor } from '../../features/invoices/invoiceThunks';
import ModalShell from './ModalShell.jsx';
import Badge from '../common/Badge.jsx';

function displayDate(value) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function InvoiceDetailModal({ ctx }) {
  const dispatch = useDispatch();
  useSelector((s) => s.ui.dataVersion); // re-render when this invoice is moved
  const perm = useSelector(selectPerm);
  const authType = useSelector((s) => s.auth.authType);
  const invoices = useSelector(selectScopedInvoices);
  const [utrInput, setUtrInput] = useState('');
  const [moving, setMoving] = useState(false);
  const inv = invoices.find((i) => i.no === ctx.no);
  if (!inv) return null;

  const next = authType === 'internal' && perm.editRows ? nextStatusFor(inv) : null;
  const needsUtr = next === 'Paid';
  async function advance() {
    if (needsUtr && !utrInput.trim()) { dispatch(pushToast('Enter the UTR number to mark this invoice Paid.')); return; }
    setMoving(true);
    try {
      await dispatch(moveInvoice({ no: inv.no, status: next, utr: needsUtr ? utrInput.trim() : undefined }));
      dispatch(pushToast(`${inv.no} moved to ${next}.`));
      setUtrInput('');
    } catch (err) {
      dispatch(pushToast(`Couldn't move invoice: ${err.message}`));
    } finally {
      setMoving(false);
    }
  }
  const stages = ['Invoice Uploaded', 'Pending Approval', 'Approved', 'Miro Booked', 'Payment Due', 'Paid'];
  const currentIndex = stages.indexOf(inv.status);
  const failed = inv.status === 'Rejected' || inv.status === 'Deleted';
  const done = failed ? 1 : (currentIndex >= 0 ? currentIndex + 1 : 1);
  const h = handlerFor(inv);
  const bookedOrLater = done >= Math.ceil(stages.length * 0.7) || inv.status === 'Paid';

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
    <ModalShell
      title={inv.no}
      width={600}
      foot={(
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" onClick={() => dispatch(openModal({ kind: 'notifyPreview', ctx: { no: inv.no } }))}>Ã¢Å“â€° Notify Supplier</button>
          </div>
          <button type="button" className="btn" onClick={() => dispatch(closeModal())}>Close</button>
        </div>
      )}
    >
      <div className="row" style={{ marginBottom: 16 }}>
        <div className="form-field" style={{ flex: 1 }}><label>Vendor</label><input value={inv.vendor} readOnly /></div>
        <div className="form-field" style={{ flex: 1 }}><label>Vendor Code</label><input value={inv.vcode} readOnly /></div>
      </div>
      <div className="row" style={{ marginBottom: 16 }}>
        <div className="form-field" style={{ flex: 1 }}><label>Channel</label><input value={CHANNEL_LABEL[inv.channel]} readOnly /></div>
        <div className="form-field" style={{ flex: 1 }}><label>PO No</label><input value={inv.po} readOnly /></div>
        <div className="form-field" style={{ flex: 1 }}><label>Amount</label><input value={inv.amount} readOnly /></div>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '-10px 0 16px' }}>Why this channel: {CHANNEL_ROUTING_RULE[inv.channel]}</p>

      {authType !== 'supplier' && (
        <>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Currently Handled By</label>
          <div className="row" style={{ margin: '8px 0 16px' }}>
            <div className="form-field" style={{ flex: 1 }}><label>Approver</label><input value={`${h.approver} · ${h.approverEmail}`} readOnly /></div>
            <div className="form-field" style={{ flex: 1 }}><label>Accounts</label><input value={bookedOrLater ? `${h.accounts} · ${h.accountsEmail}` : 'Not yet assigned'} readOnly /></div>
          </div>
        </>
      )}


      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Invoice Progress</label>
      <div style={{ margin: '10px 0 18px' }}>
        {stages.map((s, i) => {
          const idx = i + 1;
          const st = failed && idx >= done ? 'fail' : idx < done ? 'done' : idx === done ? 'current' : 'todo';
          const dotBg = st === 'fail' ? 'var(--red)' : st === 'done' ? 'var(--green)' : st === 'current' ? 'var(--blue)' : '#E2E8F0';
          const dotFg = st === 'todo' ? 'var(--text-muted)' : '#fff';
          const txtColor = st === 'todo' ? 'var(--text-muted)' : 'var(--text)';
          const dateStr = getStageDate(s);
          return (
            <div style={{ display: 'flex', gap: 10 }} key={i}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: dotBg, color: dotFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {st === 'done' ? 'Ã¢Å“â€œ' : st === 'fail' ? 'Ã¢Å“â€¢' : idx}
                </div>
                {i < stages.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 14, background: idx < done ? 'var(--blue)' : '#E2E8F0' }} />}
              </div>
              <div style={{ paddingBottom: 14, paddingTop: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: st === 'current' ? 700 : 500, color: txtColor }}>{s}</div>
                {st === 'current' && <div style={{ fontSize: 11, color: 'var(--blue)', marginTop: 2 }}>In progress</div>}
                {dateStr && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{dateStr}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {next && (
        <div className="validation-row" style={{ flexWrap: 'wrap' }}>
          <span>Move to next stage</span>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {needsUtr && (
              <input
                aria-label="UTR number"
                placeholder="UTR number"
                value={utrInput}
                onChange={(e) => setUtrInput(e.target.value)}
                style={{ padding: '6px 9px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12.5, width: 150 }}
              />
            )}
            <button type="button" className="btn primary" disabled={moving} onClick={advance}>
              {moving ? 'SavingÃ¢â‚¬Â¦' : `Mark ${next}`}
            </button>
          </span>
        </div>
      )}
      <div className="validation-row"><span>Current Status</span><Badge tone={STATUS_CHIP[inv.status] || 'gray'}>{inv.status}</Badge></div>
      <div className="validation-row"><span>UTR No.</span><span>{inv.utr === '-' ? <span style={{ color: '#CBD5E1' }}>Not yet visible</span> : inv.utr}</span></div>
      {inv.shortPayReason && <div className="validation-row"><span>Short-Payment Reason</span><span style={{ textAlign: 'right', maxWidth: 280 }}>{inv.shortPayReason}</span></div>}
      <div className="validation-row"><span>Invoice Date</span><span>{inv.date}</span></div>
    </ModalShell>
  );
}




