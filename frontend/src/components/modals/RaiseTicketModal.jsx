import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { runtime } from '../../data/runtime';
import { CHANNEL_LABEL, CHANNEL_ROUTING_RULE, TICKET_CATEGORIES, TICKET_PRIORITIES } from '../../data/constants';
import { combinedStatusFor, currentHandlerFor, currentStageName } from '../../utils/businessLogic';
import { submitTicket } from '../../features/tickets/ticketsSlice';
import { closeModal, pushToast } from '../../features/ui/uiSlice';
import ModalShell from './ModalShell.jsx';

export default function RaiseTicketModal({ ctx }) {
  const dispatch = useDispatch();
  const authType = useSelector((s) => s.auth.authType);
  const inv = runtime.invoices.find((i) => i.no === ctx.no);
  const [category, setCategory] = useState(TICKET_CATEGORIES[0]);
  const [priority, setPriority] = useState('Medium');
  const [desc, setDesc] = useState('');
  if (!inv) return null;
  const cs = combinedStatusFor(inv);
  const contact = currentHandlerFor(inv);

  function submit() {
    const raisedBy = authType === 'supplier' ? 'Supplier' : 'Internal';
    dispatch(submitTicket({ no: inv.no, category, priority, desc: desc.trim(), raisedBy }));
    dispatch(closeModal());
    dispatch(pushToast('Query submitted and routed.'));
  }

  return (
    <ModalShell
      title={`Raise a Query : ${inv.no}`}
      width={480}
      foot={(
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <button type="button" className="btn" onClick={() => dispatch(closeModal())}>Cancel</button>
          <button type="button" className="btn primary" onClick={submit}>Submit Query</button>
        </div>
      )}
    >
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Whom to Contact</label>
      <div style={{ margin: '8px 0 14px' }}>
        <div className="validation-row"><span>Channel</span><span>{CHANNEL_LABEL[inv.channel]}</span></div>
        <div className="validation-row"><span>Current Stage</span><span style={{ textAlign: 'right', maxWidth: 260 }}>{currentStageName(inv)}</span></div>
        <div className="validation-row"><span>Handled By</span><span>{contact.name}</span></div>
        <div className="validation-row"><span>Role</span><span>{contact.role}</span></div>
        <div className="validation-row"><span>Contact</span><span>{contact.email || '-'}</span></div>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '-6px 0 14px' }}>Why this channel: {CHANNEL_ROUTING_RULE[inv.channel]}</p>
      <div className="validation-row" style={{ alignItems: 'flex-start', background: 'var(--bg)' }}>
        <span>AI Assist</span>
        <span style={{ textAlign: 'right', maxWidth: 300 }}>Current status is <b>{cs.label}</b>. {cs.reason}</span>
      </div>
      <div className="form-field" style={{ marginTop: 14 }}>
        <label>Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {TICKET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="form-field">
        <label>Priority</label>
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          {TICKET_PRIORITIES.map((p) => <option key={p}>{p}</option>)}
        </select>
      </div>
      <div className="form-field">
        <label>Describe the issue</label>
        <textarea rows={4} placeholder="What's the query..." value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>
        This ticket will be linked to Invoice {inv.no}, PO {inv.po}, Vendor Code {inv.vcode} and your PAN, and routed to {contact.name} with an SLA clock.
      </p>
    </ModalShell>
  );
}
