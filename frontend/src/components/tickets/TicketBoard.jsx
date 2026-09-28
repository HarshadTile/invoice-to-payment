import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { CHANNEL_LABEL, TICKET_STATUSES, TICKET_STATUS_CHIP, PRIORITY_CHIP } from '../../data/constants';
import { ticketInvoice, ticketBreached } from '../../utils/businessLogic';
import { moveStatus } from '../../features/tickets/ticketsSlice';
import { openModal } from '../../features/ui/uiSlice';
import Badge from '../common/Badge.jsx';

export default function TicketBoard({ tickets }) {
  const dispatch = useDispatch();
  const [dragId, setDragId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  return (
    <>
      <div className="kanban-board">
        {TICKET_STATUSES.map((status) => {
          const col = tickets.filter((t) => t.status === status);
          return (
            <div
              key={status}
              className={`kanban-col${dragOverCol === status ? ' drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(status); }}
              onDragLeave={() => setDragOverCol((c) => (c === status ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverCol(null);
                if (dragId) dispatch(moveStatus({ id: dragId, status }));
                setDragId(null);
              }}
            >
              <div className="kanban-col-head"><span>{status}</span><Badge tone={TICKET_STATUS_CHIP[status]}>{col.length}</Badge></div>
              <div className="kanban-col-body">
                {col.length ? col.map((t) => {
                  const inv = ticketInvoice(t);
                  const breached = ticketBreached(t);
                  const comments = t.comments || [];
                  const last = comments[comments.length - 1];
                  return (
                    <div
                      key={t.id}
                      className="kanban-card"
                      draggable
                      onDragStart={() => setDragId(t.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => dispatch(openModal({ kind: 'ticketDetail', ctx: { id: t.id } }))}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: 12.5 }}>{t.id}</span>
                        <Badge tone={PRIORITY_CHIP[t.priority] || 'gray'}>{t.priority || 'Medium'}</Badge>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 4 }}>{t.category}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{t.no} · {CHANNEL_LABEL[inv.channel]} · {inv.vcode}</div>
                      {last ? (
                        <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <b>{last.author}:</b> {last.text}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: '#CBD5E1', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>No replies yet</div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>👤 {t.assignee || 'Unassigned'}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{comments.length ? `💬 ${comments.length}` : ''}</span>
                      </div>
                      {breached && <div style={{ marginTop: 6 }}><Badge tone="red">SLA Breached</Badge></div>}
                    </div>
                  );
                }) : <p style={{ fontSize: 11.5, color: 'var(--text-muted)', textAlign: 'center', padding: '14px 4px' }}>No tickets here.</p>}
              </div>
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>Drag a card to a different column to change its status, or click it to open the full ticket.</p>
    </>
  );
}
