import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';
import { CHANNELS, VIEW_COLUMNS, CHANNEL_LABEL, CHANNEL_SYNC_LABELS } from '../data/constants';
import { runtime } from '../data/runtime';
import { selectScopedInvoices } from '../features/invoices/selectors';
import { channelViewRows, ticketBreached, ticketInvoice } from '../utils/businessLogic';
import { setChannelViewTab, setChannelQueryViewMode, openModal } from '../features/ui/uiSlice';
import { setRows, selectTable } from '../features/tables/tablesSlice';
import { selectPerm } from '../features/auth/authSlice';
import InvoiceTable from '../components/invoices/InvoiceTable.jsx';
import EditableTable from '../components/common/EditableTable.jsx';
import StatCard from '../components/common/StatCard.jsx';
import Badge from '../components/common/Badge.jsx';
import TicketTable from '../components/tickets/TicketTable.jsx';
import TicketBoard from '../components/tickets/TicketBoard.jsx';

export default function ChannelPage() {
  const { key } = useParams();
  const dispatch = useDispatch();
  const channel = CHANNELS.find((c) => c.key === key);
  const scopedInvoices = useSelector(selectScopedInvoices);
  const savedViewTab = useSelector((s) => s.ui.channelViewTab[key]);
  const perm = useSelector(selectPerm);

  if (!channel) return <p>Unknown channel.</p>;

  const activeView = savedViewTab && channel.views.includes(savedViewTab) ? savedViewTab : channel.views[0];
  const channelInvoices = scopedInvoices.filter((i) => i.channel === key);

  return (
    <>
      <h1 className="page-title">{channel.label}</h1>
      <div className="sheet-carousel" style={{ margin: '4px 0 16px' }}>
        <div className="car-track">
          {channel.views.map((v) => (
            <button type="button" key={v} className={`car-chip${v === activeView ? ' active' : ''}`} onClick={() => dispatch(setChannelViewTab({ key, view: v }))}>{v}</button>
          ))}
        </div>
      </div>

      {activeView === 'Invoice Log' && (
        <div className="card"><InvoiceTable invoices={channelInvoices} tableKey={`channel-${key}`} mode="full" /></div>
      )}
      {activeView === 'History' && <ChannelHistory channelKey={key} channelInvoices={channelInvoices} />}
      {activeView === 'Queries' && <ChannelQueries channelKey={key} />}
      {!['Invoice Log', 'History', 'Queries'].includes(activeView) && (
        <ChannelSubView channelKey={key} view={activeView} channelInvoices={channelInvoices} canEdit={perm.editRows} canImportExport={perm.importExport} />
      )}
    </>
  );
}

function ChannelHistory({ channelKey, channelInvoices }) {
  const [activeKpi, setActiveKpi] = useState('total');
  const rows = runtime.syncLog.filter((s) => CHANNEL_SYNC_LABELS[channelKey].includes(s.channel));
  const done = channelInvoices.filter((i) => i.status === 'Paid').length;
  const failed = channelInvoices.filter((i) => i.status === 'Rejected' || i.status === 'Deleted').length;
  const ongoing = channelInvoices.length - done - failed;
  const filters = {
    total: {
      label: 'Total Invoices',
      invoices: channelInvoices,
    },
    completed: {
      label: 'Completed / Done',
      invoices: channelInvoices.filter((i) => i.status === 'Paid'),
    },
    ongoing: {
      label: 'Currently In Progress',
      invoices: channelInvoices.filter((i) => i.status !== 'Paid' && i.status !== 'Rejected' && i.status !== 'Deleted'),
    },
    failed: {
      label: 'Failed',
      invoices: channelInvoices.filter((i) => i.status === 'Rejected' || i.status === 'Deleted'),
    },
  };
  const activeFilter = filters[activeKpi] || filters.total;
  const pickKpi = (id) => setActiveKpi((current) => (current === id ? 'total' : id));

  return (
    <>
      <div className="row" style={{ marginBottom: 18 }}>
        <StatCard
          label={`${CHANNEL_LABEL[channelKey]} : Total Invoices`}
          value={channelInvoices.length}
          onClick={() => setActiveKpi('total')}
          active={activeKpi === 'total'}
        />
        <StatCard
          label="Completed / Done"
          value={done}
          onClick={() => pickKpi('completed')}
          active={activeKpi === 'completed'}
        />
        <StatCard
          tone="warn"
          label="Currently In Progress"
          value={Math.max(0, ongoing)}
          onClick={() => pickKpi('ongoing')}
          active={activeKpi === 'ongoing'}
        />
        <StatCard
          tone="bad"
          label="Failed"
          value={failed}
          onClick={() => pickKpi('failed')}
          active={activeKpi === 'failed'}
        />
      </div>
      <div className="card" style={{ marginBottom: 18 }}>
        <h3>{activeFilter.label} <span className="card-hint">{activeFilter.invoices.length} invoice{activeFilter.invoices.length === 1 ? '' : 's'}</span></h3>
        <InvoiceTable invoices={activeFilter.invoices} tableKey={`channel-${channelKey}-history-${activeKpi}`} mode="full" />
      </div>
      <div className="card">
        <h3>Data Sync Log : {CHANNEL_LABEL[channelKey]}</h3>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Source</th><th>Time</th><th>Status</th><th>Records</th><th>Message</th></tr></thead>
            <tbody>
              {rows.length ? rows.map((s, i) => (
                <tr key={i}><td>{s.channel}</td><td>{s.time}</td><td><Badge tone={s.status === 'Success' ? 'green' : 'red'}>{s.status}</Badge></td><td>{s.records}</td><td>{s.msg}</td></tr>
              )) : <tr><td colSpan={5} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 18 }}>No sync runs logged for this portal yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function ChannelQueries({ channelKey }) {
  const dispatch = useDispatch();
  const allTickets = useSelector((s) => s.tickets.items);
  const viewMode = useSelector((s) => s.ui.channelQueryViewMode);
  const tickets = allTickets.filter((t) => { const inv = ticketInvoice(t); return inv && inv.channel === channelKey; });
  const open = tickets.filter((t) => t.status === 'Open').length;
  const inProgress = tickets.filter((t) => t.status === 'In Progress').length;
  const breached = tickets.filter(ticketBreached).length;
  const resolved = tickets.filter((t) => t.status === 'Resolved' || t.status === 'Closed').length;
  const view = viewMode === 'board' ? 'board' : 'list';

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <div className="sheet-carousel">
          <div className="car-track">
            <button type="button" className={`car-chip${view === 'list' ? ' active' : ''}`} onClick={() => dispatch(setChannelQueryViewMode('list'))}>☰ List</button>
            <button type="button" className={`car-chip${view === 'board' ? ' active' : ''}`} onClick={() => dispatch(setChannelQueryViewMode('board'))}>▦ Board</button>
          </div>
        </div>
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        <StatCard tone="bad" icon="✉" label="Open" value={open} />
        <StatCard tone="warn" icon="◑" label="In Progress" value={inProgress} />
        <StatCard tone="bad" icon="⚠" label="SLA Breached" value={breached} />
        <StatCard icon="✓" label="Resolved / Closed" value={resolved} />
      </div>
      {view === 'list' ? <div className="card"><TicketTable tickets={tickets} /></div> : <TicketBoard tickets={tickets} />}
    </>
  );
}

function ChannelSubView({ channelKey, view, channelInvoices, canEdit, canImportExport }) {
  const dispatch = useDispatch();
  const tableKey = `channel-${channelKey}-${view.replace(/\s+/g, '_')}`;
  const rows = useSelector((s) => selectTable(s, tableKey));
  const cols = VIEW_COLUMNS[view];

  useEffect(() => {
    if (!rows.length) dispatch(setRows({ key: tableKey, rows: channelViewRows(channelKey, view, channelInvoices) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableKey]);

  return (
    <div className="card">
      <EditableTable
        tableKey={tableKey}
        cols={cols}
        rows={rows}
        statusCol
        canEdit={canEdit}
        canImportExport={canImportExport}
        onViewInvoice={(no) => dispatch(openModal({ kind: 'invoiceDetail', ctx: { no } }))}
        onViewVendorCode={(code) => dispatch(openModal({ kind: 'vendorCodePreview', ctx: { code } }))}
        onNotify={(no) => dispatch(openModal({ kind: 'notifyPreview', ctx: { no } }))}
      />
    </div>
  );
}
