import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import Badge from '../common/Badge.jsx';
import SortDateTh from '../common/SortDateTh.jsx';
import { useDateSort } from '../../utils/dateSort';
import { channelLabel, formatDate, PRIORITY_TONE, STATUS_LABEL, STATUS_TONE, ticketPath } from '../../utils/tickets.js';

export default function TicketTable({ tickets = [], loading = false }) {
  const navigate = useNavigate();
  const supplier = useSelector((state) => state.auth.authType === 'supplier');
  const { sorted: rows, dir, toggle } = useDateSort(tickets, (t) => t.updated_at, 'desc'); // newest first by default

  if (loading) return <div className="ticket-empty">Loading queries...</div>;
  if (!tickets.length) return <div className="ticket-empty">No queries match this view.</div>;

  return (
    <div className="table-scroll ticket-table-wrap">
      <table className="ticket-table">
        <thead>
          <tr>
            <th>Query</th>
            <th>Invoice</th>
            {!supplier && <th>Vendor</th>}
            <th>Category</th>
            <th>Priority</th>
            <th>Owner</th>
            <SortDateTh label="Updated" dir={dir} onToggle={toggle} />
            <th>SLA</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((ticket) => (
            <tr key={ticket.id} className={ticket.unread ? 'ticket-unread' : ''}>
              <td>
                <button type="button" className="link-hero" onClick={() => navigate(ticketPath(ticket, supplier))}>
                  {ticket.ticket_no}
                </button>
                <div className="cell-sub ticket-subject">{ticket.subject}</div>
              </td>
              <td>
                <span className="mono">{ticket.invoice_no || 'Not linked'}</span>
                <div className="cell-sub">{channelLabel(ticket.channel)}</div>
              </td>
              {!supplier && <td className="mono">{ticket.vendor_code || '-'}</td>}
              <td>{ticket.category}</td>
              <td><Badge tone={PRIORITY_TONE[ticket.priority] || 'gray'}>{ticket.priority}</Badge></td>
              <td>{ticket.assignee?.name || ticket.assignee?.team || 'Unassigned'}</td>
              <td>{formatDate(ticket.updated_at, true)}</td>
              <td>
                {ticket.sla?.breached
                  ? <Badge tone="red">Breached</Badge>
                  : <span className="cell-muted">{ticket.awaiting === 'STAFF' ? 'Staff' : 'Supplier'}</span>}
              </td>
              <td><Badge tone={STATUS_TONE[ticket.status] || 'gray'}>{STATUS_LABEL[ticket.status] || ticket.status}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
