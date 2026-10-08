import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { ticketInvoice, currentHandlerFor, ticketBreached, panFor } from '../../utils/businessLogic';
import { TICKET_PRIORITIES, PRIORITY_CHIP, TICKET_STATUS_CHIP, ASSIGNEE_ROSTER } from '../../data/constants';
import { postComment, setStatus, setPriority, setAssignee } from '../../features/tickets/ticketsSlice';
import { selectPerm } from '../../features/auth/authSlice';
import { closeModal, pushToast } from '../../features/ui/uiSlice';
import ModalShell from './ModalShell.jsx';
import Badge from '../common/Badge.jsx';

export default function TicketDetailModal({ ctx }) {
  const dispatch = useDispatch();
  const t = useSelector((s) => s.tickets.items.find((x) => x.id === ctx.id));
  const { authType, supplierQuery } = useSelector((s) => s.auth);
  const perm = useSelector(selectPerm);
  const [tab, setTab] = useState('Conversation');
  const [reply, setReply] = useState('');

  if (!t) return null;
  const inv = ticketInvoice(t);
  const owner = currentHandlerFor(inv);
  const breached = ticketBreached(t);
  const isSupplier = authType === 'supplier';
  const canEdit = !isSupplier && perm.editRows;
  const comments = t.comments || [];
  const activity = t.activity || [];
  const canReply = t.status !== 'Closed';

  function sendReply() {
    if (!reply.trim()) { dispatch(pushToast('Write a reply before sending.')); return; }
    const author = isSupplier ? supplierQuery : owner.name;
    const role = isSupplier ? 'Supplier' : owner.role;
    dispatch(postComment({ id: t.id, author, role, text: reply.trim() }));
    setReply('');
    dispatch(pushToast('Reply sent.'));
  }

  return (
    <ModalShell
      title={t.id}
      width={560}
      foot={(
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          {canEdit && t.status !== 'Closed' ? (
            <div style={{ display: 'flex', gap: 8 }}>
              {t.status === 'Open' && <button type="button" className="btn" onClick={() => dispatch(setStatus({ id: t.id, status: 'In Progress' }))}>Start Work</button>}
              {t.status !== 'Resolved'
                ? <button type="button" className="btn" onClick={() => dispatch(setStatus({ id: t.id, status: 'Resolved' }))}>Mark Resolved</button>
                : <button type="button" className="btn" onClick={() => dispatch(setStatus({ id: t.id, status: 'Closed' }))}>Close Ticket</button>}
            </div>
          ) : <span />}
          <button type="button" className="btn" onClick={() => dispatch(closeModal())}>Close</button>
        </div>
      )}
    >
      <div className="validation-row"><span>Status</span><Badge tone={TICKET_STATUS_CHIP[t.status]}>{t.status}</Badge></div>
      {breached
        ? <div className="validation-row"><span>SLA</span><Badge tone="red">Breached, escalated to COE / Accounts lead</Badge></div>
        : <div className="validation-row"><span>SLA</span><Badge tone="gray">{t.slaHours}h from raise</Badge></div>}
      <div className="validation-row"><span>Category</span><span>{t.category}</span></div>
      <div className="validation-row">
        <span>Priority</span>
        {canEdit
          ? <select style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12.5, width: 'auto' }} value={t.priority} onChange={(e) => dispatch(setPriority({ id: t.id, priority: e.target.value }))}>
              {TICKET_PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
          : <Badge tone={PRIORITY_CHIP[t.priority] || 'gray'}>{t.priority || 'Medium'}</Badge>}
      </div>
      <div className="validation-row">
        <span>Assignee</span>
        {canEdit
          ? <select style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12.5, width: 'auto' }} value={t.assignee} onChange={(e) => dispatch(setAssignee({ id: t.id, assignee: e.target.value }))}>
              {ASSIGNEE_ROSTER.map((a) => <option key={a}>{a}</option>)}
            </select>
          : <span>{t.assignee || 'Unassigned'}</span>}
      </div>
      <div className="validation-row" style={{ alignItems: 'flex-start' }}><span>Description</span><span style={{ textAlign: 'right', maxWidth: 300 }}>{t.desc}</span></div>
      <div className="validation-row"><span>Raised By</span><span>{t.raisedBy}, {t.raisedDate}</span></div>
      <div className="validation-row"><span>Stage Owner</span><span>{owner.name}<br /><span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{owner.email}</span></span></div>

      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', display: 'block', margin: '14px 0 8px' }}>Traceability</label>
      <div className="validation-row"><span>Invoice</span><span>{inv.no}</span></div>
      <div className="validation-row"><span>Vendor Code</span><span className="mono">{inv.vcode}</span></div>
      <div className="validation-row"><span>PO No</span><span>{inv.po}</span></div>
      <div className="validation-row"><span>PAN</span><span>{panFor(inv.vendor)}</span></div>
      {t.resolvedDate && <div className="validation-row"><span>Resolved</span><span>{t.resolvedDate}</span></div>}

      <div className="sheet-carousel" style={{ margin: '16px 0 10px' }}>
        <div className="car-track">
          <button type="button" className={`car-chip${tab === 'Conversation' ? ' active' : ''}`} onClick={() => setTab('Conversation')}>Conversation ({comments.length})</button>
          <button type="button" className={`car-chip${tab === 'Activity' ? ' active' : ''}`} onClick={() => setTab('Activity')}>Activity Log ({activity.length})</button>
        </div>
      </div>

      {tab === 'Conversation' ? (
        <>
          <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: canReply ? 10 : 0 }}>
            {comments.length ? comments.map((c, i) => {
              const mine = c.role === 'Supplier';
              return (
                <div key={i} style={{ alignSelf: mine ? 'flex-start' : 'flex-end', maxWidth: '82%', background: mine ? 'var(--gray-bg)' : 'var(--blue-bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 11px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>{c.author}{c.role ? ` · ${c.role}` : ''}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text)', marginTop: 2, whiteSpace: 'pre-wrap' }}>{c.text}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 3 }}>{c.date}</div>
                </div>
              );
            }) : <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0' }}>No replies yet.</p>}
          </div>
          {canReply ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea rows={2} placeholder={isSupplier ? `Reply to ${owner.name}...` : 'Reply to the supplier...'} value={reply} onChange={(e) => setReply(e.target.value)} />
              <button type="button" className="btn primary" onClick={sendReply}>Reply</button>
            </div>
          ) : (
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>
              This query is closed. {isSupplier ? 'Raise a new query from the invoice if this needs to be revisited.' : 'Reopen it via a status change above to add more replies.'}
            </p>
          )}
        </>
      ) : (
        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
          {activity.length ? [...activity].reverse().map((a, i) => (
            <div key={i} style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, color: 'var(--text)' }}>{a.text}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>{a.date}</div>
            </div>
          )) : <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No activity logged yet.</p>}
        </div>
      )}
    </ModalShell>
  );
}
