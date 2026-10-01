import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, useSearchParams } from 'react-router-dom';
import { CHANNELS, VIEW_COLUMNS, VIEW_ADD_LABEL, CHANNEL_LABEL, CHANNEL_SYNC_LABELS } from '../data/constants';
import { runtime } from '../data/runtime';
import { selectScopedInvoices } from '../features/invoices/selectors';
import { channelViewRows, ticketBreached, ticketInvoice } from '../utils/businessLogic';
import { setChannelViewTab, setChannelQueryViewMode, openModal, setPageFilters } from '../features/ui/uiSlice';
import { setRows, selectTable } from '../features/tables/tablesSlice';
import { selectPerm } from '../features/auth/authSlice';
import InvoiceTable from '../components/invoices/InvoiceTable.jsx';
import InvoiceFilterBar, { defaultInvoiceRange, invoiceYMD } from '../components/invoices/InvoiceFilterBar.jsx';
import EditableTable from '../components/common/EditableTable.jsx';
import StatCard from '../components/common/StatCard.jsx';
import Badge from '../components/common/Badge.jsx';
import TicketTable from '../components/tickets/TicketTable.jsx';
import TicketBoard from '../components/tickets/TicketBoard.jsx';

/** Status + date-range filter (same one used on My Invoices / Search Invoice(s)), scoped to this channel's invoices.
 *  Persisted per channel in Redux so it survives navigating away and back — the
 *  sidebar always links to the bare channel URL, which would otherwise reset it. */
function useChannelInvoiceFilter(channelInvoices, channelKey) {
  const dispatch = useDispatch();
  const filterKey = `channel-${channelKey}`;
  const saved = useSelector((s) => s.ui.pageFilters[filterKey]);
  const [searchParams, setSearchParams] = useSearchParams();
  const range = defaultInvoiceRange();

  const cameInFresh = !['status', 'date_from', 'date_to'].some((k) => searchParams.has(k));
  const restored = cameInFresh ? saved : null;

  const status = restored?.status ?? (searchParams.get('status') || '');
  const dateFrom = restored?.dateFrom ?? (searchParams.has('date_from') ? searchParams.get('date_from') : range.from);
  const dateTo = restored?.dateTo ?? (searchParams.has('date_to') ? searchParams.get('date_to') : range.to);

  // Write restored filters into the URL once, and keep Redux's copy current on every change.
  useEffect(() => {
    if (!restored) return;
    const next = new URLSearchParams(searchParams);
    let changed = false;
    if (restored.status && !next.has('status')) { next.set('status', restored.status); changed = true; }
    if (restored.dateFrom !== undefined && !next.has('date_from')) { next.set('date_from', restored.dateFrom); changed = true; }
    if (restored.dateTo !== undefined && !next.has('date_to')) { next.set('date_to', restored.dateTo); changed = true; }
    if (changed) setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    dispatch(setPageFilters({ key: filterKey, filters: { status, dateFrom, dateTo } }));
  }, [dispatch, filterKey, status, dateFrom, dateTo]);

  const update = (changes) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([k, v]) => { if (v === null) next.delete(k); else next.set(k, v); });
    setSearchParams(next, { replace: true });
  };

  const inRange = channelInvoices.filter((i) => {
    const ymd = invoiceYMD(i);
    return (!dateFrom || ymd >= dateFrom) && (!dateTo || ymd <= dateTo);
  });
  const shown = inRange.filter((i) => !status || i.status === status);
  const isDefaultRange = dateFrom === range.from && dateTo === range.to;
  const rangeLabel = !dateFrom && !dateTo ? 'all dates' : (isDefaultRange ? 'last 90 days' : `${dateFrom || 'earliest'} to ${dateTo || 'latest'}`);

  const bar = (
    <InvoiceFilterBar
      status={status} dateFrom={dateFrom} dateTo={dateTo}
      onStatusChange={(v) => update({ status: v || null })} onDateFrom={(v) => update({ date_from: v })} onDateTo={(v) => update({ date_to: v })}
      onLast90Days={() => update({ date_from: null, date_to: null })}
      onAllDates={() => update({ date_from: '', date_to: '' })}
      onClear={() => update({ status: null, date_from: '', date_to: '' })}
      statusCountBase={inRange} resultCount={shown.length} rangeLabel={rangeLabel}
    />
  );
  return { shown, bar };
}

export default function ChannelPage() {
  const { key } = useParams();
  const dispatch = useDispatch();
  const channel = CHANNELS.find((c) => c.key === key);
  const scopedInvoices = useSelector(selectScopedInvoices);
  const savedViewTab = useSelector((s) => s.ui.channelViewTab[key]);
  const perm = useSelector(selectPerm);
  const channelInvoices = scopedInvoices.filter((i) => i.channel === key);
  const { shown: filteredChannelInvoices, bar: channelFilterBar } = useChannelInvoiceFilter(channelInvoices, key);

  if (!channel) return <p>Unknown channel.</p>;

  const activeView = savedViewTab && channel.views.includes(savedViewTab) ? savedViewTab : channel.views[0];

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
        <>
          {channelFilterBar}
          <div className="card"><InvoiceTable invoices={filteredChannelInvoices} tableKey={`channel-${key}`} mode="full" /></div>
        </>
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
        entityLabel={VIEW_ADD_LABEL[view] || 'Row'}
        canEdit={canEdit}
        canImportExport={canImportExport}
        onViewInvoice={(no) => dispatch(openModal({ kind: 'invoiceDetail', ctx: { no } }))}
        onViewVendorCode={(code) => dispatch(openModal({ kind: 'vendorCodePreview', ctx: { code } }))}
        onNotify={(no) => dispatch(openModal({ kind: 'notifyPreview', ctx: { no } }))}
      />
    </div>
  );
}
