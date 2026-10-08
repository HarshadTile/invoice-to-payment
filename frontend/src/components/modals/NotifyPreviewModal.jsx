import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { runtime } from '../../data/runtime';
import { CHANNEL_LABEL } from '../../data/constants';
import { handlerFor, supplierEmailFor, currentStageName } from '../../utils/businessLogic';
import { closeModal, pushToast } from '../../features/ui/uiSlice';
import ModalShell from './ModalShell.jsx';

export default function NotifyPreviewModal({ ctx }) {
  const dispatch = useDispatch();
  const inv = runtime.invoices.find((i) => i.no === ctx.no);
  const [note, setNote] = useState('');
  if (!inv) return null;
  const h = handlerFor(inv);
  const supplierEmail = supplierEmailFor(inv.vendor);

  const bodyRows = [
    ['Invoice No', inv.no],
    ['Vendor Code', inv.vcode],
    ['Vendor', inv.vendor],
    ['Channel', CHANNEL_LABEL[inv.channel]],
    ['PO No', inv.po],
    ['Amount', inv.amount],
    ['Status', inv.status],
    ['Current Stage', currentStageName(inv)],
    ['UTR No', inv.utr === '-' ? 'Not yet visible' : inv.utr],
    ['Invoice Date', inv.date],
  ];
  if (inv.shortPayReason) bodyRows.push(['Short-Payment Reason', inv.shortPayReason]);

  function send() {
    dispatch(closeModal());
    dispatch(pushToast(`Status email sent for ${inv.no}${note.trim() ? ' (with your note)' : ''}.`));
  }

  return (
    <ModalShell
      title={`Notify Supplier : ${inv.no}`}
      width={520}
      foot={(
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <button type="button" className="btn" onClick={() => dispatch(closeModal())}>Cancel</button>
          <button type="button" className="btn primary" onClick={send}>✉ Send</button>
        </div>
      )}
    >
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>This is what would go out. Nothing is sent until you confirm.</p>
      <div className="validation-row"><span>To</span><span style={{ textAlign: 'right' }}>{inv.vendor}<br /><span style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>{supplierEmail}</span></span></div>
      <div className="validation-row"><span>CC : Approver</span><span style={{ textAlign: 'right' }}>{h.approver}<br /><span style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>{h.approverEmail}</span></span></div>
      <div className="validation-row"><span>CC : Accounts</span><span style={{ textAlign: 'right' }}>{h.accounts}<br /><span style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>{h.accountsEmail}</span></span></div>
      <div className="validation-row"><span>Subject</span><span style={{ textAlign: 'right' }}>Status update : Invoice {inv.no}</span></div>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', display: 'block', margin: '16px 0 8px' }}>Mail Body : Combined Status</label>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', background: 'var(--bg)' }}>
        {bodyRows.map(([k, v]) => (
          <div className="validation-row" style={{ padding: '6px 0' }} key={k}><span>{k}</span><span style={{ textAlign: 'right', maxWidth: 280 }}>{v}</span></div>
        ))}
      </div>
      <div className="form-field" style={{ marginTop: 16 }}>
        <label>Add a note (optional)</label>
        <textarea rows={3} placeholder="Anything you want to add to this mail..." value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </ModalShell>
  );
}
