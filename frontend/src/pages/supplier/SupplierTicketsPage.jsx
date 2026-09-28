import { useDispatch, useSelector } from 'react-redux';
import { ticketInvoice } from '../../utils/businessLogic';
import { setTicketFilterStatus } from '../../features/ui/uiSlice';
import StatCard from '../../components/common/StatCard.jsx';
import TicketTable from '../../components/tickets/TicketTable.jsx';

export default function SupplierTicketsPage() {
  const dispatch = useDispatch();
  const code = useSelector((s) => s.auth.supplierLoginVcode);
  const ticketItems = useSelector((s) => s.tickets.items);
  const allTickets = ticketItems.filter((t) => ticketInvoice(t)?.vcode === code);
  const ticketFilterStatus = useSelector((s) => s.ui.ticketFilterStatus);

  const open = allTickets.filter((t) => t.status === 'Open').length;
  const inProgress = allTickets.filter((t) => t.status === 'In Progress').length;
  const resolved = allTickets.filter((t) => t.status === 'Resolved' || t.status === 'Closed').length;

  let tickets;
  if (ticketFilterStatus === 'Open' || ticketFilterStatus === 'In Progress') tickets = allTickets.filter((t) => t.status === ticketFilterStatus);
  else if (ticketFilterStatus === 'Resolved') tickets = allTickets.filter((t) => t.status === 'Resolved' || t.status === 'Closed');
  else tickets = allTickets.filter((t) => t.status === 'Open' || t.status === 'In Progress');

  return (
    <>
      <h1 className="page-title">My Queries</h1>
      <p className="page-sub">Every query raised on {code}, and where it stands. Raise a new one from any invoice. Resolved and closed queries drop out of the list below.</p>
      <div className="row" style={{ marginBottom: 20 }}>
        <StatCard label="Open" value={open} onClick={() => dispatch(setTicketFilterStatus('Open'))} active={ticketFilterStatus === 'Open'} />
        <StatCard tone="warn" label="In Progress" value={inProgress} onClick={() => dispatch(setTicketFilterStatus('In Progress'))} active={ticketFilterStatus === 'In Progress'} />
        <StatCard label="Resolved / Closed" value={resolved} sub="Click to view: hidden by default" onClick={() => dispatch(setTicketFilterStatus('Resolved'))} active={ticketFilterStatus === 'Resolved'} />
      </div>
      <div className="card">
        {tickets.length ? <TicketTable tickets={tickets} /> : <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No open queries right now. Open any invoice and use "Raise a Query" to start one.</p>}
      </div>
    </>
  );
}
