import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setTicketFilterStatus } from '../../features/ui/uiSlice';
import { useGetTicketsQuery, useGetTicketSummaryQuery } from '../../features/tickets/ticketsApi';
import StatCard from '../../components/common/StatCard.jsx';
import TicketTable from '../../components/tickets/TicketTable.jsx';
import TicketExportButton from '../../components/tickets/TicketExportButton.jsx';
import { CheckCircle, Clock, Inbox, Search } from '../../components/common/icons.jsx';

const FILTER_STATUS = {
  Open: ['OPEN'],
  'In Progress': ['IN_PROGRESS'],
  Resolved: ['RESOLVED', 'CLOSED'],
};

const matchesSearch = (ticket, needle) => !needle || [
  ticket.ticket_no, ticket.subject, ticket.invoice_no, ticket.vendor_code, ticket.category,
].some((value) => String(value || '').toLowerCase().includes(needle));

export default function SupplierTicketsPage() {
  const dispatch = useDispatch();
  const statusFilter = useSelector((state) => state.ui.ticketFilterStatus);
  const [search, setSearch] = useState('');
  const liveQueryOptions = { pollingInterval: 15000, skipPollingIfUnfocused: true, refetchOnFocus: true, refetchOnMountOrArgChange: true };
  const { data: page, isLoading } = useGetTicketsQuery({ include_closed: true, page_size: 100 }, liveQueryOptions);
  const { data: summary = {} } = useGetTicketSummaryQuery(undefined, liveQueryOptions);
  const statuses = FILTER_STATUS[statusFilter];
  const tickets = (statuses
    ? (page?.items || []).filter((ticket) => statuses.includes(ticket.status))
    : (page?.items || []).filter((ticket) => ['OPEN', 'IN_PROGRESS'].includes(ticket.status)))
    .filter((ticket) => matchesSearch(ticket, search.trim().toLowerCase()));

  return (
    <section className="ticket-desk dash">
      <div className="kpi-grid ticket-stats supplier-stats">
        <StatCard tone="shade-miro" icon={<Inbox />} label="Open" value={summary.open || 0} sub="Waiting for the Mahindra team" onClick={() => dispatch(setTicketFilterStatus('Open'))} active={statusFilter === 'Open'} />
        <StatCard tone="shade-pending" icon={<Clock />} label="In Progress" value={summary.in_progress || 0} sub="Being worked on" onClick={() => dispatch(setTicketFilterStatus('In Progress'))} active={statusFilter === 'In Progress'} />
        <StatCard tone="shade-neutral" icon={<CheckCircle />} label="Resolved / Closed" value={summary.resolved_closed || 0} sub="Answered queries" onClick={() => dispatch(setTicketFilterStatus('Resolved'))} active={statusFilter === 'Resolved'} />
      </div>
      <div className="card ticket-toolbar">
        <span className="ticket-toolbar-hint">
          <b>Queries</b>
          <span className="ticket-count">
            {`${tickets.length} quer${tickets.length === 1 ? 'y' : 'ies'} · ${statuses ? statusFilter : 'Open + In Progress'}`}
          </span>
        </span>
        <label className="ticket-search">
          <Search />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search query no, invoice, subject…" aria-label="Search queries" />
        </label>
        <TicketExportButton tickets={tickets} loading={isLoading} />
      </div>
      <TicketTable tickets={tickets} loading={isLoading} />
    </section>
  );
}
