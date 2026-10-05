import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import Badge from '../common/Badge.jsx';
import { formatDate, PRIORITY_TONE, STATUS_LABEL, STATUS_TONE, ticketPath } from '../../utils/tickets.js';

const COLUMNS = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

export default function TicketBoard({ groups = {}, loading = false }) {
  const navigate = useNavigate();
  const supplier = useSelector((state) => state.auth.authType === 'supplier');

  if (loading) return <div className="ticket-empty">Loading board...</div>;

  return (
    <div className="kanban-board" aria-label="Query status board">
      {COLUMNS.map((status) => {
        const tickets = groups[status.toLowerCase()] || [];
        return (
          <section className="kanban-col" key={status}>
            <header className="kanban-col-head">
              <span>{STATUS_LABEL[status]}</span>
              <Badge tone={STATUS_TONE[status]}>{tickets.length}</Badge>
            </header>
            <div className="kanban-col-body">
              {tickets.map((ticket) => (
                <button
                  type="button"
                  className="kanban-card"
                  key={ticket.id}
                  onClick={() => navigate(ticketPath(ticket, supplier))}
                >
                  <span className="kanban-card-top">
                    <b>{ticket.ticket_no}</b>
                    <Badge tone={PRIORITY_TONE[ticket.priority] || 'gray'}>{ticket.priority}</Badge>
                  </span>
                  <span className="kanban-card-subject">{ticket.subject}</span>
                  <span className="kanban-card-meta mono">{ticket.invoice_no || 'Legacy query'}</span>
                  <span className="kanban-card-foot">
                    <span>{ticket.assignee?.name || 'Unassigned'}</span>
                    <span>{formatDate(ticket.updated_at)}</span>
                  </span>
                  {ticket.sla?.breached && <Badge tone="red">SLA breached</Badge>}
                </button>
              ))}
              {!tickets.length && <div className="kanban-empty">No queries</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
