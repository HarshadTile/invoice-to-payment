import { useDispatch, useSelector } from 'react-redux';
import { setTicketFilterStatus } from '../../features/ui/uiSlice';
import { useGetTicketsQuery, useGetTicketSummaryQuery } from '../../features/tickets/ticketsApi';
import StatCard from '../../components/common/StatCard.jsx';
import TicketTable from '../../components/tickets/TicketTable.jsx';
import { CheckCircle, Clock, Inbox } from '../../components/common/icons.jsx';

const FILTER_STATUS = {
  Open: ['OPEN'],
  'In Progress': ['IN_PROGRESS'],
  Resolved: ['RESOLVED', 'CLOSED'],
};

export default function SupplierTicketsPage() {
  const dispatch = useDispatch();
  const statusFilter = useSelector((state) => state.ui.ticketFilterStatus);
  const liveQueryOptions = { pollingInterval: 15000, skipPollingIfUnfocused: true, refetchOnFocus: true, refetchOnMountOrArgChange: true };
  const { data: page, isLoading } = useGetTicketsQuery({ include_closed: true, page_size: 100 }, liveQueryOptions);
  const { data: summary = {} } = useGetTicketSummaryQuery(undefined, liveQueryOptions);
  const statuses = FILTER_STATUS[statusFilter];
  const tickets = statuses
    ? (page?.items || []).filter((ticket) => statuses.includes(ticket.status))
    : (page?.items || []).filter((ticket) => ['OPEN', 'IN_PROGRESS'].includes(ticket.status));

  return (
    <section className="ticket-desk">
      <div className="row ticket-stats supplier-stats">
        <StatCard tone="bad" icon={<Inbox />} label="Open" value={summary.open || 0} onClick={() => dispatch(setTicketFilterStatus('Open'))} active={statusFilter === 'Open'} />
        <StatCard tone="warn" icon={<Clock />} label="In Progress" value={summary.in_progress || 0} onClick={() => dispatch(setTicketFilterStatus('In Progress'))} active={statusFilter === 'In Progress'} />
        <StatCard icon={<CheckCircle />} label="Resolved / Closed" value={summary.resolved_closed || 0} onClick={() => dispatch(setTicketFilterStatus('Resolved'))} active={statusFilter === 'Resolved'} />
      </div>
      <TicketTable tickets={tickets} loading={isLoading} />
    </section>
  );
}
