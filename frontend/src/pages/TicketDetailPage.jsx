import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useAssignTicketMutation,
  useCloseTicketMutation,
  useGetAssignableUsersQuery,
  useGetTicketActivityQuery,
  useGetTicketQuery,
  useMarkTicketReadMutation,
  useReopenTicketMutation,
  useReplyToTicketMutation,
  useResolveTicketMutation,
  useUpdateTicketMutation,
  useUploadAttachmentMutation,
} from '../features/tickets/ticketsApi.js';
import { useMarkTicketNotificationsReadMutation } from '../features/notifications/notificationsApi';
import Badge from '../components/common/Badge.jsx';
import { ArrowLeft, CheckCircle, Clock, Paperclip, RotateCcw, Send } from '../components/common/icons.jsx';
import { TICKET_CATEGORIES } from '../data/constants.js';
import { channelLabel, formatDate, messageSide, PRIORITY_TONE, STATUS_LABEL, STATUS_TONE } from '../utils/tickets.js';
import { api } from '../api/client.js';

function mutationMessage(error) {
  return error?.data?.message || 'The query changed or the action could not be completed. Refresh and try again.';
}

function activityLabel(event) {
  return event.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}

export default function TicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const supplier = useSelector((state) => state.auth.authType === 'supplier');
  const [tab, setTab] = useState('conversation');
  const [message, setMessage] = useState('');
  const [visibility, setVisibility] = useState('PUBLIC');
  const [assigneeId, setAssigneeId] = useState('');
  const [actionMode, setActionMode] = useState(null);
  const [actionText, setActionText] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const { data: ticket, isLoading, isError, refetch } = useGetTicketQuery(id, {
    pollingInterval: 15000,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
  });
  const actions = useMemo(() => new Set(ticket?.allowed_actions || []), [ticket?.allowed_actions]);
  const canPublicReply = actions.has('reply');
  const canNote = actions.has('note');
  const canCompose = canPublicReply || canNote;
  const effectiveVisibility = canPublicReply ? visibility : 'INTERNAL';
  const canManageAssignment = actions.has('assign') || actions.has('reassign');
  const { data: assignable = [] } = useGetAssignableUsersQuery(ticket?.channel, {
    skip: !ticket?.channel || !canManageAssignment,
  });
  const { data: activity = [], isLoading: activityLoading } = useGetTicketActivityQuery(id, {
    skip: supplier || tab !== 'activity',
  });

  const [markRead] = useMarkTicketReadMutation();
  const [clearNotifications] = useMarkTicketNotificationsReadMutation();
  const [reply, replyState] = useReplyToTicketMutation();
  const [assign, assignState] = useAssignTicketMutation();
  const [updateTicket, updateState] = useUpdateTicketMutation();
  const [resolve, resolveState] = useResolveTicketMutation();
  const [close, closeState] = useCloseTicketMutation();
  const [reopen, reopenState] = useReopenTicketMutation();
  const [upload, uploadState] = useUploadAttachmentMutation();
  const busy = replyState.isLoading || assignState.isLoading || updateState.isLoading || resolveState.isLoading || closeState.isLoading || reopenState.isLoading || uploadState.isLoading;

  useEffect(() => {
    if (ticket?.unread && !supplier) markRead(ticket.id);
  }, [ticket?.id, ticket?.unread, supplier, markRead]);

  // Opening a query clears this person's notifications about it, so the bell badge doesn't keep counting it.
  useEffect(() => {
    if (ticket?.id) clearNotifications({ ticketId: ticket.id });
  }, [ticket?.id, clearNotifications]);

  async function run(request) {
    setError('');
    try {
      await request.unwrap();
      setActionMode(null);
      setActionText('');
      return true;
    } catch (requestError) {
      setError(mutationMessage(requestError));
      if (requestError?.status === 409) refetch();
      return false;
    }
  }

  async function sendMessage() {
    if (!message.trim()) return setError('Write a message before sending.');
    const ok = await run(reply({ id, body: message.trim(), visibility: effectiveVisibility, expected_version: ticket.row_version }));
    if (ok) setMessage('');
  }

  async function submitAction() {
    if (actionMode === 'resolve') {
      if (!actionText.trim()) return setError('Add a resolution note.');
      await run(resolve({ id, resolution_note: actionText.trim(), expected_version: ticket.row_version }));
    }
    if (actionMode === 'reopen') {
      if (!actionText.trim()) return setError('Tell the team why this query needs to be reopened.');
      await run(reopen({ id, reason: actionText.trim(), expected_version: ticket.row_version }));
    }
  }

  async function attachFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await run(upload({ id, file, visibility: effectiveVisibility, expected_version: ticket.row_version }));
  }

  async function downloadAttachment(attachment) {
    setError('');
    try {
      const response = await fetch(`/api/v1/tickets/${id}/attachments/${attachment.id}`, {
        headers: api.authHeaders(),
      });
      if (!response.ok) throw new Error('Download failed.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.original_name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError.message);
    }
  }

  if (isLoading) return <div className="ticket-empty">Loading query...</div>;
  if (isError || !ticket) return <div className="ticket-error"><h1>Query unavailable</h1><p>It may be outside your workspace or no longer available.</p><button className="btn" type="button" onClick={() => navigate(-1)}>Go back</button></div>;

  const dueAt = ticket.sla?.response_due_at || ticket.sla?.reply_expected_by;

  return (
    <section className="ticket-detail-page">
      <header className="ticket-detail-head">
        <button type="button" className="icon-btn" onClick={() => navigate(supplier ? '/supplier/tickets' : '/app/inquiry-desk')} title="Back to queries"><ArrowLeft /></button>
        <div className="ticket-title-block">
          <div className="ticket-title-line">
            <span className="mono">{ticket.ticket_no}</span>
            <Badge tone={STATUS_TONE[ticket.status] || 'gray'}>{STATUS_LABEL[ticket.status] || ticket.status}</Badge>
            {ticket.legacy_unlinked && <Badge tone="gray">Legacy read-only</Badge>}
          </div>
          <h1>{ticket.subject}</h1>
        </div>
        <div className="ticket-head-actions">
          {actions.has('resolve') && <button className="btn primary" type="button" onClick={() => setActionMode('resolve')}><CheckCircle /> Resolve</button>}
          {actions.has('close') && <button className="btn primary" type="button" disabled={busy} onClick={() => run(close({ id, expected_version: ticket.row_version }))}><CheckCircle /> Close</button>}
          {actions.has('reopen') && <button className="btn" type="button" onClick={() => setActionMode('reopen')}><RotateCcw /> Reopen</button>}
        </div>
      </header>

      {error && <div className="ticket-alert" role="alert">{error}</div>}

      <div className="ticket-detail-grid">
        <main className="ticket-thread">
          <div className="ticket-tabs">
            <button type="button" className={tab === 'conversation' ? 'active' : ''} onClick={() => setTab('conversation')}>Conversation <span>{ticket.comments.length}</span></button>
            {!supplier && <button type="button" className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>Activity <span>{activity.length}</span></button>}
          </div>

          {tab === 'conversation' ? (
            <>
              <div className="message-list">
                <article className={`ticket-description ${supplier ? 'own' : 'other'}`}>
                  <div><b>Original query</b><time>{formatDate(ticket.created_at, true)}</time></div>
                  <p>{ticket.description}</p>
                </article>
                {ticket.comments.map((comment) => {
                  return (
                  <article className={`ticket-message ${messageSide(comment.author_role, supplier)}${comment.visibility === 'INTERNAL' ? ' internal' : ''}`} key={comment.id}>
                    <div className="message-meta">
                      <b>{comment.author}</b>
                      {comment.visibility === 'INTERNAL' && <Badge tone="amber">Internal note</Badge>}
                      <time>{formatDate(comment.created_at, true)}</time>
                    </div>
                    <p>{comment.body}</p>
                  </article>
                  );
                })}
                {!ticket.comments.length && <div className="message-empty">No replies yet.</div>}
              </div>

              {canCompose && (
                <div className="message-composer">
                  {canPublicReply && canNote && (
                    <div className="composer-mode" role="group" aria-label="Message visibility">
                      <button type="button" className={visibility === 'PUBLIC' ? 'active' : ''} onClick={() => setVisibility('PUBLIC')}>Public reply</button>
                      <button type="button" className={visibility === 'INTERNAL' ? 'active' : ''} onClick={() => setVisibility('INTERNAL')}>Internal note</button>
                    </div>
                  )}
                  <textarea rows={4} maxLength={5000} placeholder={effectiveVisibility === 'INTERNAL' ? 'Add a note for the internal team' : 'Write a reply'} value={message} onChange={(event) => setMessage(event.target.value)} />
                  <div className="composer-actions">
                    <input ref={fileRef} type="file" hidden onChange={attachFile} />
                    {(effectiveVisibility === 'PUBLIC' ? actions.has('attach_public') : actions.has('attach_internal')) && <button type="button" className="btn" disabled={busy} onClick={() => fileRef.current?.click()}><Paperclip /> Attach</button>}
                    <button type="button" className="btn primary" disabled={busy || !message.trim()} onClick={sendMessage}><Send /> Send</button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="activity-list">
              {activityLoading && <div className="ticket-empty">Loading activity...</div>}
              {activity.map((item) => (
                <div className="activity-row" key={item.id}>
                  <span className="activity-dot" />
                  <div><b>{activityLabel(item.event)}</b><time>{formatDate(item.created_at, true)}</time></div>
                </div>
              ))}
            </div>
          )}
        </main>

        <aside className="ticket-facts">
          {dueAt && (
            <div className={`sla-panel${ticket.sla.breached ? ' breached' : ''}`}>
              <Clock />
              <div><span>{ticket.sla.breached ? 'Response overdue' : ticket.awaiting === 'STAFF' ? 'Staff response due' : 'Waiting for supplier'}</span><b>{formatDate(dueAt, true)}</b></div>
            </div>
          )}

          <section>
            <h2>Ownership</h2>
            <label>Assignee</label>
            {canManageAssignment ? (
              <div className="inline-control">
                <select value={assigneeId || (ticket.assignee?.id ? String(ticket.assignee.id) : '')} onChange={(event) => setAssigneeId(event.target.value)}>
                  <option value="">Select assignee</option>
                  {assignable.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
                <button type="button" className="btn" disabled={!assigneeId || busy} onClick={() => run(assign({ id, assignee_id: Number(assigneeId), expected_version: ticket.row_version }))}>Assign</button>
              </div>
            ) : <p>{ticket.assignee?.name || ticket.assignee?.team || 'Unassigned'}</p>}
          </section>

          <section>
            <h2>Query details</h2>
            <label>Status</label><p><Badge tone={STATUS_TONE[ticket.status]}>{STATUS_LABEL[ticket.status]}</Badge></p>
            <label>Priority</label>
            {actions.has('change_priority') ? (
              <select value={ticket.priority} disabled={busy} onChange={(event) => run(updateTicket({ id, priority: event.target.value, expected_version: ticket.row_version }))}>
                <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option>
              </select>
            ) : <p><Badge tone={PRIORITY_TONE[ticket.priority]}>{ticket.priority}</Badge></p>}
            <label>Category</label>
            {actions.has('change_priority') ? (
              <select value={ticket.category} disabled={busy} onChange={(event) => run(updateTicket({ id, category: event.target.value, expected_version: ticket.row_version }))}>
                {TICKET_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
              </select>
            ) : <p>{ticket.category}</p>}
            <label>Awaiting</label><p>{ticket.awaiting === 'STAFF' ? 'Internal team' : 'Supplier'}</p>
            <label>Created</label><p>{formatDate(ticket.created_at, true)}</p>
          </section>

          <section>
            <h2>Invoice</h2>
            <label>Invoice number</label><p className="mono">{ticket.invoice_no || 'Not linked'}</p>
            <label>PO number</label><p className="mono">{ticket.invoice?.po_no || '-'}</p>
            <label>Vendor code</label><p className="mono">{ticket.vendor_code || '-'}</p>
            <label>Channel</label><p>{channelLabel(ticket.channel)}</p>
            <label>Fiscal year</label><p>{ticket.fy || '-'}</p>
          </section>

          {!!ticket.attachments.length && (
            <section>
              <h2>Attachments</h2>
              <div className="attachment-list">
                {ticket.attachments.map((attachment) => <button type="button" key={attachment.id} onClick={() => downloadAttachment(attachment)}><Paperclip /> <span>{attachment.original_name}</span></button>)}
              </div>
            </section>
          )}
        </aside>
      </div>

      {actionMode && (
        <div className="ticket-action-bar">
          <div>
            <b>{actionMode === 'resolve' ? 'Resolve query' : 'Reopen query'}</b>
            <textarea rows={2} placeholder={actionMode === 'resolve' ? 'Resolution note' : 'Reason for reopening'} value={actionText} onChange={(event) => setActionText(event.target.value)} />
          </div>
          <button type="button" className="btn" onClick={() => { setActionMode(null); setActionText(''); }}>Cancel</button>
          <button type="button" className="btn primary" disabled={busy || !actionText.trim()} onClick={submitAction}>{actionMode === 'resolve' ? 'Resolve' : 'Reopen'}</button>
        </div>
      )}
    </section>
  );
}
