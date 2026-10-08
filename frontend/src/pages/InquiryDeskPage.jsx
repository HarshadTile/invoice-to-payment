import { useDispatch, useSelector } from 'react-redux';
import { CHANNELS, INTERNAL_TEAM_CHANNELS } from '../data/constants';
import { ticketInvoice, ticketBreached } from '../utils/businessLogic';
import { setInquiryViewMode, setInquiryChannelTab, setTicketFilterStatus } from '../features/ui/uiSlice';
import StatCard from '../components/common/StatCard.jsx';
import TicketTable from '../components/tickets/TicketTable.jsx';
import TicketBoard from '../components/tickets/TicketBoard.jsx';

export default function InquiryDeskPage() {
  const dispatch = useDispatch();
  const allTickets = useSelector((s) => s.tickets.items);
  const { authType, channelScope } = useSelector((s) => s.auth);
  const scopeTickets = (authType === 'internal' && channelScope === 'internalTeam')
    ? allTickets.filter((t) => { const inv = ticketInvoice(t); return inv && INTERNAL_TEAM_CHANNELS.includes(inv.channel); })
    : allTickets;
  const inquiryChannelTab = useSelector((s) => s.ui.inquiryChannelTab);
  const inquiryViewMode = useSelector((s) => s.ui.inquiryViewMode);
  const ticketFilterStatus = useSelector((s) => s.ui.ticketFilterStatus);

  const chTab = inquiryChannelTab && CHANNELS.some((c) => c.key === inquiryChannelTab) ? inquiryChannelTab : CHANNELS[0].key;
  const byChannel = allTickets.filter((t) => { const inv = ticketInvoice(t); return inv && inv.channel === chTab; }).filter((t) => scopeTickets.includes(t));

  const open = byChannel.filter((t) => t.status === 'Open').length;
  const inProgress = byChannel.filter((t) => t.status === 'In Progress').length;
  const breached = byChannel.filter(ticketBreached).length;
  const resolved = byChannel.filter((t) => t.status === 'Resolved' || t.status === 'Closed').length;

  let tickets;
  if (ticketFilterStatus === 'Open' || ticketFilterStatus === 'In Progress') tickets = byChannel.filter((t) => t.status === ticketFilterStatus);
  else if (ticketFilterStatus === 'Resolved') tickets = byChannel.filter((t) => t.status === 'Resolved' || t.status === 'Closed');
  else tickets = byChannel.filter((t) => t.status === 'Open' || t.status === 'In Progress');

  const view = inquiryViewMode === 'board' ? 'board' : 'list';

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">Inquiry Desk</h1>
          <p className="page-sub">Every query raised by a supplier or logged internally against an invoice, PO, vendor code or PAN, in one queue. Resolved and closed queries drop out of the default view below.</p>
        </div>
        <div className="sheet-carousel">
          <div className="car-track">
            <button type="button" className={`car-chip${view === 'list' ? ' active' : ''}`} onClick={() => dispatch(setInquiryViewMode('list'))}>☰ List</button>
            <button type="button" className={`car-chip${view === 'board' ? ' active' : ''}`} onClick={() => dispatch(setInquiryViewMode('board'))}>▦ Board</button>
          </div>
        </div>
      </div>

      <div className="sheet-carousel" style={{ marginBottom: 14 }}>
        <div className="car-track">
          {CHANNELS.map((c) => {
            const n = allTickets.filter((t) => { const inv = ticketInvoice(t); return inv && inv.channel === c.key; }).filter((t) => scopeTickets.includes(t)).length;
            return <button type="button" key={c.key} className={`car-chip${chTab === c.key ? ' active' : ''}`} onClick={() => dispatch(setInquiryChannelTab(c.key))}>{c.label} ({n})</button>;
          })}
        </div>
      </div>

      <div className="row" style={{ marginBottom: 20 }}>
        <StatCard tone="bad" icon="✉" label="Open" value={open} sub="Not yet picked up" onClick={() => dispatch(setTicketFilterStatus('Open'))} active={ticketFilterStatus === 'Open'} />
        <StatCard tone="warn" icon="◑" label="In Progress" value={inProgress} sub="Being worked" onClick={() => dispatch(setTicketFilterStatus('In Progress'))} active={ticketFilterStatus === 'In Progress'} />
        <StatCard tone="bad" icon="⚠" label="SLA Breached" value={breached} sub="Past their response window" />
        <StatCard icon="✓" label="Resolved / Closed" value={resolved} sub="Click to view: hidden by default" onClick={() => dispatch(setTicketFilterStatus('Resolved'))} active={ticketFilterStatus === 'Resolved'} />
      </div>

      {view === 'list' ? <div className="card"><TicketTable tickets={tickets} /></div> : <TicketBoard tickets={tickets} />}
    </>
  );
}
