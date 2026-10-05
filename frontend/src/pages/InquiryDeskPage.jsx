import { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import { setInquiryViewMode, setTicketFilterStatus } from '../features/ui/uiSlice';
import { useGetTicketBoardQuery, useGetTicketsQuery, useGetTicketSummaryQuery } from '../features/tickets/ticketsApi';
import StatCard from '../components/common/StatCard.jsx';
import TicketTable from '../components/tickets/TicketTable.jsx';
import TicketBoard from '../components/tickets/TicketBoard.jsx';
import { CheckCircle, Clock, Columns, Inbox, List } from '../components/common/icons.jsx';
import { getFiscalYear } from '../utils/businessLogic.js';

const FILTER_STATUS = {
  Open: ['OPEN'],
  'In Progress': ['IN_PROGRESS'],
  Resolved: ['RESOLVED', 'CLOSED'],
};

export default function InquiryDeskPage() {
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const view = useSelector((state) => state.ui.inquiryViewMode === 'board' ? 'board' : 'list');
  const statusFilter = useSelector((state) => state.ui.ticketFilterStatus);
  const filters = useMemo(() => ({
    channel: searchParams.get('channel') || undefined,
    fy: searchParams.get('fy') || getFiscalYear(new Date().toISOString()),
    vendor_code: searchParams.get('vcode') || undefined,
  }), [searchParams]);

  const liveQueryOptions = { pollingInterval: 15000, skipPollingIfUnfocused: true, refetchOnFocus: true, refetchOnMountOrArgChange: true };
  const { data: page, isLoading } = useGetTicketsQuery(
    { ...filters, include_closed: true, page_size: 100 },
    { ...liveQueryOptions, skip: view !== 'list' },
  );
  const { data: board = {}, isLoading: boardLoading } = useGetTicketBoardQuery(
    filters,
    { ...liveQueryOptions, skip: view !== 'board' },
  );
  const { data: summary = {} } = useGetTicketSummaryQuery(filters, liveQueryOptions);
  const allowedStatuses = FILTER_STATUS[statusFilter];
  const tickets = allowedStatuses
    ? (page?.items || []).filter((ticket) => allowedStatuses.includes(ticket.status))
    : (page?.items || []).filter((ticket) => ['OPEN', 'IN_PROGRESS'].includes(ticket.status));

  return (
    <section className="ticket-desk">
      <div className="ticket-page-head">
        <div>
          <h1 className="page-title">Inquiry Desk</h1>
          <p className="page-sub">Invoice-linked supplier queries across your authorized workspace.</p>
        </div>
        <div className="view-switch" role="group" aria-label="Query view">
          <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => dispatch(setInquiryViewMode('list'))} title="List view"><List /> <span>List</span></button>
          <button type="button" className={view === 'board' ? 'active' : ''} onClick={() => dispatch(setInquiryViewMode('board'))} title="Board view"><Columns /> <span>Board</span></button>
        </div>
      </div>

      <div className="row ticket-stats">
        <StatCard tone="bad" icon={<Inbox />} label="Open" value={summary.open || 0} sub="Waiting for assignment" onClick={() => dispatch(setTicketFilterStatus('Open'))} active={statusFilter === 'Open'} />
        <StatCard tone="warn" icon={<Clock />} label="In Progress" value={summary.in_progress || 0} sub="Owned and active" onClick={() => dispatch(setTicketFilterStatus('In Progress'))} active={statusFilter === 'In Progress'} />
        <StatCard tone="bad" icon={<Clock />} label="SLA Breached" value={summary.sla_breached || 0} sub="Response overdue" />
        <StatCard icon={<CheckCircle />} label="Resolved / Closed" value={summary.resolved_closed || 0} onClick={() => dispatch(setTicketFilterStatus('Resolved'))} active={statusFilter === 'Resolved'} />
      </div>

      {view === 'list'
        ? <TicketTable tickets={tickets} loading={isLoading} />
        : <TicketBoard groups={board} loading={boardLoading} />}
    </section>
  );
}
