import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { CHANNEL_LABEL, STATUS_CHIP } from '../../data/constants';
import { handlerFor, supplierEmailFor, currentStageName, findInvoice } from '../../utils/businessLogic';
import { closeModal, pushToast } from '../../features/ui/uiSlice';
import ModalShell from './ModalShell.jsx';
import Badge from '../common/Badge.jsx';

export default function NotifyPreviewModal({ ctx }) {
  const dispatch = useDispatch();
  const inv = findInvoice(ctx.no, ctx.poItem);
  const [note, setNote] = useState('');

  if (!inv) {
    return (
      <ModalShell
        title="Notify Supplier"
        width={440}
        foot={<button type="button" className="btn" onClick={() => dispatch(closeModal())}>Close</button>}
      >
        <p style={{ color: 'var(--text-muted)' }}>
          No invoice record found for <b>{ctx.no || '(blank)'}</b>, so there's no supplier/approver/accounts contact
          to notify. This usually means the row's "Invoice No" doesn't match a real invoice in Invoice Log — check
          the value and try again.
        </p>
      </ModalShell>
    );
  }
  const h = handlerFor(inv);
  const supplierEmail = supplierEmailFor(inv.vendor);

  const bodyRows = [
    ['Invoice No', inv.no],
    ['Vendor Code', inv.vcode],
    ['Vendor', inv.vendor],
    ['Channel', CHANNEL_LABEL[inv.channel]],
    ['PO No', inv.po],
    ['Amount', inv.amount],
    ['Status', <Badge key="status" tone={STATUS_CHIP[inv.status] || 'gray'}>{inv.status}</Badge>],
    ['Current Stage', currentStageName(inv)],
    ['UTR No', inv.utr === '-' ? 'Not yet visible' : inv.utr],
    ['Invoice Date', inv.date],
  ];
  if (inv.shortPayReason) bodyRows.push(['Short-Payment Reason', inv.shortPayReason]);
  const monoKeys = new Set(['Invoice No', 'Vendor Code', 'PO No', 'Amount', 'UTR No']);

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
          <button type="button" className="btn primary" onClick={send}>Send Email</button>
        </div>
      )}
    >
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>This is what would go out. Nothing is sent until you confirm.</p>
      <div className="mail-preview">
        <div className="mail-head">
          <div className="kv-row"><span className="kv-k">To</span><span className="kv-v">{inv.vendor}<span className="kv-sub">{supplierEmail}</span></span></div>
          <div className="kv-row"><span className="kv-k">CC (Approver)</span><span className="kv-v">{h.approver}<span className="kv-sub">{h.approverEmail}</span></span></div>
          <div className="kv-row"><span className="kv-k">CC (Accounts)</span><span className="kv-v">{h.accounts}<span className="kv-sub">{h.accountsEmail}</span></span></div>
          <div className="kv-row"><span className="kv-k">Subject</span><span className="kv-v">Status update: Invoice {inv.no}</span></div>
        </div>
        <div className="mail-body">
          <p className="mail-title">Combined status</p>
          {bodyRows.map(([k, v]) => (
            <div className="kv-row" key={k}>
              <span className="kv-k">{k}</span>
              <span className={`kv-v${monoKeys.has(k) ? ' mono' : ''}`}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="form-field" style={{ marginTop: 16 }}>
        <label>Add a note (optional)</label>
        <textarea rows={3} placeholder="Anything you want to add to this mail..." value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </ModalShell>
  );
}
