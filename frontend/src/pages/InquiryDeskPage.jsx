import { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setInquiryViewMode, setTicketFilterStatus } from '../features/ui/uiSlice';
import { useGetTicketBoardQuery, useGetTicketsQuery, useGetTicketSummaryQuery } from '../features/tickets/ticketsApi';
import StatCard from '../components/common/StatCard.jsx';
import TicketTable from '../components/tickets/TicketTable.jsx';
import TicketBoard from '../components/tickets/TicketBoard.jsx';
import TicketExportButton from '../components/tickets/TicketExportButton.jsx';
import { CheckCircle, Clock, Columns, Inbox, List, Search } from '../components/common/icons.jsx';
import { useScope } from '../features/ui/scope';

const FILTER_STATUS = {
  Open: ['OPEN'],
  'In Progress': ['IN_PROGRESS'],
  Resolved: ['RESOLVED', 'CLOSED'],
};

const matchesSearch = (ticket, needle) => !needle || [
  ticket.ticket_no, ticket.subject, ticket.invoice_no, ticket.vendor_code, ticket.category,
  ticket.priority, ticket.assignee?.name, ticket.assignee?.team,
].some((value) => String(value || '').toLowerCase().includes(needle));

export default function InquiryDeskPage() {
  const dispatch = useDispatch();
  const scope = useScope();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const needle = search.trim().toLowerCase();
  const view = useSelector((state) => state.ui.inquiryViewMode === 'board' ? 'board' : 'list');
  const statusFilter = useSelector((state) => state.ui.ticketFilterStatus);
  const filters = useMemo(() => ({
    channel: scope.channel || undefined,
    fy: scope.fy,
    vendor_code: scope.vcode || undefined,
  }), [scope.channel, scope.fy, scope.vcode]);

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
  const categories = useMemo(() => {
    const all = view === 'board' ? Object.values(board).flat() : (page?.items || []);
    return [...new Set(all.map((ticket) => ticket.category).filter(Boolean))].sort();
  }, [view, board, page]);
  const keep = (ticket) => (!category || ticket.category === category) && matchesSearch(ticket, needle);
  const shownTickets = tickets.filter(keep);
  const shownBoard = useMemo(() => Object.fromEntries(
    Object.entries(board).map(([key, list]) => [key, Array.isArray(list) ? list.filter(keep) : list]),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [board, needle, category]);

  return (
    <section className="ticket-desk">
      <div className="row ticket-stats">
        <StatCard tone="bad" icon={<Inbox />} label="Open" value={summary.open || 0} sub="Waiting for assignment" onClick={() => dispatch(setTicketFilterStatus('Open'))} active={statusFilter === 'Open'} />
        <StatCard tone="warn" icon={<Clock />} label="In Progress" value={summary.in_progress || 0} sub="Owned and active" onClick={() => dispatch(setTicketFilterStatus('In Progress'))} active={statusFilter === 'In Progress'} />
        <StatCard tone="bad" icon={<Clock />} label="SLA Breached" value={summary.sla_breached || 0} sub="Response overdue" />
        <StatCard icon={<CheckCircle />} label="Resolved / Closed" value={summary.resolved_closed || 0} onClick={() => dispatch(setTicketFilterStatus('Resolved'))} active={statusFilter === 'Resolved'} />
      </div>

      <div className="ticket-toolbar" style={{ flexWrap: 'wrap' }}>
        <span className="ticket-toolbar-hint">
          {view === 'list' ? `${shownTickets.length} quer${shownTickets.length === 1 ? 'y' : 'ies'} · ${statusFilter && FILTER_STATUS[statusFilter] ? statusFilter : 'Open + In Progress'}` : 'All queries by status'}
        </span>
        <label className="ticket-search">
          <Search />
          <input
            type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search query no, invoice, vendor, subject, owner…" aria-label="Search queries"
          />
        </label>
        <select className="ticket-category" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <TicketExportButton
          tickets={view === 'list' ? shownTickets : ['open', 'in_progress', 'resolved', 'closed'].flatMap((key) => shownBoard[key] || [])}
          loading={view === 'list' ? isLoading : boardLoading}
        />
        <div className="view-switch" role="group" aria-label="Query view">
          <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => dispatch(setInquiryViewMode('list'))} title="List view"><List /> <span>List</span></button>
          <button type="button" className={view === 'board' ? 'active' : ''} onClick={() => dispatch(setInquiryViewMode('board'))} title="Board view"><Columns /> <span>Board</span></button>
        </div>
      </div>

      {view === 'list'
        ? <TicketTable tickets={shownTickets} loading={isLoading} />
        : <TicketBoard groups={shownBoard} loading={boardLoading} />}
    </section>
  );
}
