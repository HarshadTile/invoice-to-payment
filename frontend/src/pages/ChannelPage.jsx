import { useScope } from '../features/ui/scope';
import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, useSearchParams } from 'react-router-dom';
import useEnabledChannels from '../features/settings/useEnabledChannels';
import { CHANNELS, VIEW_COLUMNS, CHANNEL_LABEL, CHANNEL_SYNC_LABELS } from '../data/constants';
import { runtime } from '../data/runtime';
import { selectFilteredInvoicesAnyChannel } from '../features/invoices/selectors';
import { channelViewRows } from '../utils/businessLogic';
import PoPortalWorkspace from '../components/invoices/PoPortalWorkspace.jsx';
import { setChannelViewTab, openModal, setPageFilters } from '../features/ui/uiSlice';
import { setRowsLocal, selectTable } from '../features/tables/tablesSlice';
import { selectPerm } from '../features/auth/authSlice';
import InvoiceTable from '../components/invoices/InvoiceTable.jsx';
import InvoiceFilterBar, { invoiceYMD } from '../components/invoices/InvoiceFilterBar.jsx';
import EditableTable from '../components/common/EditableTable.jsx';
import StatCard from '../components/common/StatCard.jsx';
import Badge from '../components/common/Badge.jsx';
import SrmWorkspace from '../components/invoices/SrmWorkspace.jsx';

/** Status + date-range filter (same one used on My Invoices / Search Invoice(s)), scoped to this channel's invoices.
 *  Persisted per channel in Redux so it survives navigating away and back — the
 *  sidebar always links to the bare channel URL, which would otherwise reset it. */
function useChannelInvoiceFilter(channelInvoices, channelKey, enabled = true) {
  const dispatch = useDispatch();
  const scope = useScope();
  const filterKey = `channel-${channelKey}`;
  const saved = useSelector((s) => s.ui.pageFilters[filterKey]);
  const [searchParams, setSearchParams] = useSearchParams();

  const cameInFresh = !['status', 'date_from', 'date_to'].some((k) => searchParams.has(k));
  const restored = cameInFresh ? saved : null;

  const status = restored?.status ?? (searchParams.get('status') || '');
  const dateFrom = restored?.dateFrom ?? (searchParams.has('date_from') ? searchParams.get('date_from') : '');
  const dateTo = restored?.dateTo ?? (searchParams.has('date_to') ? searchParams.get('date_to') : '');

  // Write restored filters into the URL once, and keep Redux's copy current on every change.
  useEffect(() => {
    if (!enabled || !restored) return;
    const next = new URLSearchParams(searchParams);
    let changed = false;
    if (restored.status && !next.has('status')) { next.set('status', restored.status); changed = true; }
    if (restored.dateFrom !== undefined && !next.has('date_from')) { next.set('date_from', restored.dateFrom); changed = true; }
    if (restored.dateTo !== undefined && !next.has('date_to')) { next.set('date_to', restored.dateTo); changed = true; }
    if (changed) setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    if (!enabled) return;
    dispatch(setPageFilters({ key: filterKey, filters: { status, dateFrom, dateTo } }));
  }, [dispatch, filterKey, status, dateFrom, dateTo, enabled]);

  const update = (changes) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([k, v]) => { if (v === null) next.delete(k); else next.set(k, v); });
    setSearchParams(next, { replace: true });
  };

  // SRM / PO Portal bring their own filters; skip scanning their (large) lists on every render.
  const inRange = useMemo(() => !enabled ? [] : channelInvoices.filter((i) => {
    const ymd = invoiceYMD(i, scope.dateField);
    if ((dateFrom || dateTo) && !ymd) return false;
    return (!dateFrom || ymd >= dateFrom) && (!dateTo || ymd <= dateTo);
  }), [enabled, channelInvoices, scope.dateField, dateFrom, dateTo]);
  const shown = useMemo(() => inRange.filter((i) => !status || i.status === status), [inRange, status]);
  const rangeLabel = !dateFrom && !dateTo ? 'all dates' : `${dateFrom || 'earliest'} to ${dateTo || 'latest'}`;

  const bar = (
    <InvoiceFilterBar
      status={status} dateFrom={dateFrom} dateTo={dateTo}
      onStatusChange={(v) => update({ status: v || null })} onDateFrom={(v) => update({ date_from: v })} onDateTo={(v) => update({ date_to: v })}
      onAllDates={() => update({ date_from: '', date_to: '' })}
      onClear={() => update({ status: null, date_from: '', date_to: '' })}
      statusCountBase={inRange} resultCount={shown.length} rangeLabel={rangeLabel}
    />
  );
  return { shown, bar };
}

export default function ChannelPage() {
  const enabledChannels = useEnabledChannels();
  const { key } = useParams();
  const dispatch = useDispatch();
  const channel = CHANNELS.find((c) => c.key === key);
  // top-bar fiscal year / vendor apply; the channel is this page's own
  const scopedInvoices = useSelector(selectFilteredInvoicesAnyChannel);
  const savedViewTab = useSelector((s) => s.ui.channelViewTab[key]);
  const perm = useSelector(selectPerm);
  const channelInvoices = useMemo(() => scopedInvoices.filter((i) => i.channel === key), [scopedInvoices, key]);
  const { shown: filteredChannelInvoices, bar: channelFilterBar } = useChannelInvoiceFilter(channelInvoices, key, !['msetuSrm', 'poPortal'].includes(key));

  if (!channel) return <p>Unknown channel.</p>;
  if (!enabledChannels.some((item) => item.key === key)) return <div className="card"><p>This portal is currently disabled. Contact your administrator.</p></div>;

  if (key === 'msetuSrm') return <SrmWorkspace invoices={channelInvoices} canExport={perm.importExport} />;
  if (key === 'poPortal') return <PoPortalWorkspace invoices={channelInvoices} canExport={perm.importExport} />;

  const activeView = savedViewTab && channel.views.includes(savedViewTab) ? savedViewTab : channel.views[0];

  return (
    <>
      <div className="sheet-carousel">
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
      {!['Invoice Log', 'History'].includes(activeView) && (
        <ChannelSubView channelKey={key} view={activeView} channelInvoices={channelInvoices} canImportExport={perm.importExport} />
      )}
    </>
  );
}

function ChannelHistory({ channelKey, channelInvoices }) {
  const [activeKpi, setActiveKpi] = useState('total');
  const rows = runtime.syncLog.filter((s) => CHANNEL_SYNC_LABELS[channelKey].includes(s.channel));
  const done = channelInvoices.filter((i) => i.status === 'Paid').length;
  const failed = channelInvoices.filter((i) => i.status === 'Rejected' || ['Deleted', 'Entry Deleted'].includes(i.status)).length;
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
      invoices: channelInvoices.filter((i) => i.status !== 'Paid' && i.status !== 'Rejected' && !['Deleted', 'Entry Deleted'].includes(i.status)),
    },
    failed: {
      label: 'Failed',
      invoices: channelInvoices.filter((i) => i.status === 'Rejected' || ['Deleted', 'Entry Deleted'].includes(i.status)),
    },
  };
  const activeFilter = filters[activeKpi] || filters.total;
  const pickKpi = (id) => setActiveKpi((current) => (current === id ? 'total' : id));

  return (
    <>
      <div className="row" style={{ marginBottom: '1.125rem' }}>
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
      <div className="card" style={{ marginBottom: '1.125rem' }}>
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
              )) : <tr><td colSpan={5} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1.125rem' }}>No sync runs logged for this portal yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function ChannelSubView({ channelKey, view, channelInvoices, canImportExport }) {
  const dispatch = useDispatch();
  const tableKey = `channel-${channelKey}-${view.replace(/\s+/g, '_')}`;
  const rows = useSelector((s) => selectTable(s, tableKey));
  const cols = VIEW_COLUMNS[view];

  useEffect(() => {
    // Derived from the invoice data on screen (so it follows the top-bar year / vendor): kept in memory only, never written to the server.
    dispatch(setRowsLocal({ key: tableKey, rows: channelViewRows(channelKey, view, channelInvoices) }));
  }, [dispatch, tableKey, channelKey, view, channelInvoices]);

  return (
    <div className="card">
      <EditableTable
        tableKey={tableKey}
        cols={cols}
        rows={rows}
        statusCol
        canImportExport={canImportExport}
        onViewInvoice={(no) => dispatch(openModal({ kind: 'invoiceDetail', ctx: { no } }))}
        onViewVendorCode={(code) => dispatch(openModal({ kind: 'vendorCodePreview', ctx: { code } }))}
      />
    </div>
  );
}
