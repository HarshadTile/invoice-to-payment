import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { CHANNELS, CHANNEL_LABEL } from '../data/constants';
import { useScope } from '../features/ui/scope';
import { selectFilteredInvoices } from '../features/invoices/selectors';
import { selectIsChannelLocked } from '../features/auth/authSlice';
import { dashboardMetrics, formatCount, formatMoney, formatShare, share } from '../features/invoices/dashboardMetrics';
import { api } from '../api/client';
import { setPageFilters } from '../features/ui/uiSlice';
import { calendarMonthOf, invoiceDateTypeLabel, monthDateRange } from '../utils/invoiceDates';
import StatCard from '../components/common/StatCard.jsx';
import ChartCard from '../components/dashboard/ChartCard.jsx';
import InvoiceDateTypeFilter from '../components/invoices/InvoiceDateTypeFilter.jsx';
import ColumnChart from '../components/dashboard/ColumnChart.jsx';
import RingGauge from '../components/dashboard/RingGauge.jsx';
import RankedBars from '../components/dashboard/RankedBars.jsx';
import RecentInvoices from '../components/invoices/RecentInvoices.jsx';
import { Banknote, CheckCircle, Clock, FileText, Layers, Package, Settings } from '../components/common/icons.jsx';

const USE_FASTAPI_INVOICES = import.meta.env.MODE !== 'test'
  && import.meta.env.VITE_USE_FASTAPI_INVOICES === 'true';
const RECENT_LIMIT = 5;

/* Mahindra red-and-white, checked with the dataviz palette validator on the white card:
   product = red / rose (the monthly columns stack the two). Channel rings each show one share,
   so they all use the brand red and are told apart by their names. */
// Flat fills: Mahindra red / rose (validated pair) and a neutral for "not specified".
const PRODUCT_COLOR = { Service: '#C8102E', Material: '#E8909C', Other: '#C9C7C0' };
const PRODUCT_ICON = { Service: Settings, Material: Package, Other: FileText };
// One flat colour per channel ring (validated categorical set on white).
const CHANNEL_SHADES = {
  msetuSrm: ['#C8102E', '#C8102E'], poPortal: ['#E8909C', '#E8909C'],
  manual: ['#eda100', '#eda100'], mfoxPortal: ['#6250d6', '#6250d6'],
};
const EXCEPTION_FILL = '#9A9DA4'; // rejected / deleted: named, never colour alone

/** Workflow statuses step from rose (first) to deep red (last): one flat ordinal red ramp
 *  (end points validated with the dataviz ordinal check on white). */
function flowShade(index, count) {
  const from = [232, 144, 156]; // #E8909C
  const to = [110, 10, 25]; // #6E0A19
  const t = count > 1 ? index / (count - 1) : 1;
  const mix = (k) => Math.round(from[k] + (to[k] - from[k]) * t);
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}

function recentFrom(invoices) {
  return [...invoices]
    .sort((a, b) => new Date(b.rawUploadDate || b.rawDate || b.date) - new Date(a.rawUploadDate || a.rawDate || a.date))
    .slice(0, RECENT_LIMIT);
}

export default function InvoicesPage() {
  // already narrowed to the top-bar scope (fiscal year / channel / vendor)
  const filteredInvoices = useSelector(selectFilteredInvoices);
  const topScope = useScope();
  const isChannelLocked = useSelector(selectIsChannelLocked);
  const { channelScope } = useSelector((s) => s.auth);
  const navigate = useNavigate();

  const dispatch = useDispatch();
  // Search Invoice(s) remembers its last filters; a month click keeps them and only sets the dates.
  const savedSearch = useSelector((s) => s.ui.pageFilters.searchInvoice);
  const selectedMonth = calendarMonthOf(savedSearch?.dateFrom, savedSearch?.dateTo);
  /** Open Search Invoice(s) for one calendar month, on the date type chosen in the filters. */
  const openMonth = (column) => {
    const { from, to } = monthDateRange(column.key);
    const next = new URLSearchParams({ date_from: from, date_to: to, from: 'tracking' });
    for (const [param, key] of [['q', 'q'], ['status', 'status'], ['productType', 'productType']]) {
      if (savedSearch?.[key]) next.set(param, savedSearch[key]);
    }
    navigate(`/app/search?${next.toString()}`);
  };
  const clearMonth = () => dispatch(setPageFilters({ key: 'searchInvoice', filters: { ...savedSearch, dateFrom: '', dateTo: '' } }));

  /** Open Search Invoice(s) for one product type, every status and date, so the list matches the card. */
  const openSearchByProduct = (productType) => {
    const next = new URLSearchParams({ productType, status: '', date_from: '', date_to: '', from: 'tracking' });
    navigate(`/app/search?${next.toString()}`);
  };

  /** Open Search Invoice(s) showing only this status, across all dates so the list matches the number clicked. */
  const openSearchByStatus = (status) => {
    // `from` lets the Search page offer a way back to this dashboard
    const next = new URLSearchParams({ status, date_from: '', date_to: '', from: 'tracking' });
    navigate(`/app/search?${next.toString()}`);
  };

  // Every figure comes from the same list the rest of the app shows, so they always agree.
  const channelOrder = useMemo(() => (isChannelLocked ? CHANNELS.filter((c) => c.key === channelScope) : CHANNELS).map((c) => c.key), [isChannelLocked, channelScope]);
  // The monthly chart groups by the date type chosen in the filters (shared with Search).
  const dateField = topScope.dateField || 'invoice';
  const dateTypeLabel = invoiceDateTypeLabel(dateField).toLowerCase();
  const m = useMemo(() => dashboardMetrics(filteredInvoices, channelOrder, dateField), [filteredInvoices, channelOrder, dateField]);
  const total = m.total.count;
  const money = (value) => formatMoney(value, m.currency);
  const exact = (value) => formatMoney(value, m.currency, { compact: false });
  /** A bucket's value, or a plain note when none of its invoices has an amount on record. */
  const valueOf = (bucket) => (bucket.valued ? money(bucket.value) : 'No amount on record');

  // Latest invoices still come from the server when nothing is filtered.
  const [recent, setRecent] = useState(null);
  const dataVersion = useSelector((s) => s.ui.dataVersion);
  const fetchKey = `${channelScope}:${dataVersion}`;
  useEffect(() => {
    let alive = true;
    const scope = channelScope !== 'all' ? `scope=${channelScope}` : '';
    (async () => {
      try {
        if (USE_FASTAPI_INVOICES) {
          const { invoiceApi, toWorkspaceInvoice } = await import('../api/invoiceApi');
          const r = await invoiceApi.recent({ limit: RECENT_LIMIT, channel: channelScope || 'all' });
          if (alive && Array.isArray(r)) setRecent({ key: fetchKey, data: r.map(toWorkspaceInvoice) });
        } else {
          const r = await api.get(`/dashboard/latest-invoices?count=${RECENT_LIMIT}${scope ? `&${scope}` : ''}`);
          if (alive && Array.isArray(r)) setRecent({ key: fetchKey, data: r });
        }
      } catch { /* fall back to the loaded list */ }
    })();
    return () => { alive = false; };
  }, [fetchKey, channelScope]);
  const isFiltering = topScope.channel || topScope.vcode || topScope.fy !== 'all';
  const recentRows = (!isFiltering && recent?.key === fetchKey) ? recent.data : recentFrom(filteredInvoices);

  const paid = m.kpi.paid;
  const exceptions = m.groups.find((g) => g.key === 'exception')?.count || 0;
  const productParts = m.product.filter((p) => p.key !== 'Other' || p.count > 0)
    .map((p) => ({ ...p, color: PRODUCT_COLOR[p.key], ink: p.key === 'Service' ? '#fff' : '#0b0b0b' }));
  const channelRings = m.channels.filter((c) => c.count > 0);
  const otherCurrencyNote = Object.entries(m.otherCurrencies).map(([cur, value]) => formatMoney(value, cur || '?')).join(' + ');

  const statusTile = (label, bucket, status, icon, sub, shade) => (
    <StatCard
      tone={shade} label={label} value={formatCount(bucket.count)} icon={icon} sub={sub}
      meter={share(bucket.count, total)}
      foot={<><b>{formatShare(bucket.count, total)}</b> of invoices · {valueOf(bucket)}</>}
      onClick={() => openSearchByStatus(status)}
    />
  );

  return (
    <div className="dash">
      {/* ── 1. Headline numbers ── */}
      <div className="kpi-grid">
        <StatCard
          tone="shade-total" label="Total Invoices" value={formatCount(total)} icon={<FileText size={16} />} sub="All statuses in this selection"
          foot={<><span title={exact(m.total.value)}><b>{valueOf(m.total)}</b> total value</span> · {formatCount(exceptions)} rejected / deleted</>}
          onClick={() => openSearchByStatus('')}
        />
        {statusTile('Pending Approval', m.kpi.pendingApproval, 'Pending for Approval', <Clock size={16} />, 'Awaiting approver action', 'shade-pending')}
        {statusTile('Approved', m.kpi.approved, 'Approved', <CheckCircle size={16} />, 'Approved by business', 'shade-approved')}
        {statusTile('Miro Booked', m.kpi.miroBooked, 'Miro Booked', <Layers size={16} />, 'Booked in SAP, awaiting payment', 'shade-miro')}
        {statusTile('Paid', paid, 'Paid', <Banknote size={16} />, 'Payment cleared', 'shade-paid')}
      </div>
      {otherCurrencyNote && <p className="chart-note">Values are in {m.currency}; other currencies add {otherCurrencyNote} (not converted).</p>}

      {/* ── 2. Where invoices come from, and what they are ── */}
      <div className="dash-charts">
        <ChartCard
          title="Invoices by channel" className="dash-channels"
          table={{
            head: ['Channel', 'Invoices', 'Share'],
            rows: m.channels.map((c) => [CHANNEL_LABEL[c.key] || c.key, formatCount(c.count), formatShare(c.count, total)]),
            foot: ['Total', formatCount(total), total ? '100%' : '0%'],
          }}
        >
          {channelRings.length ? (
            <div className="ring-row">
              {channelRings.map((c) => (
                <RingGauge key={c.key} label={CHANNEL_LABEL[c.key] || c.key} part={c.count} whole={total}
                  shades={CHANNEL_SHADES[c.key]} sub={c.valued ? money(c.value) : null} />
              ))}
            </div>
          ) : <p className="chart-empty">No invoices for this selection.</p>}
        </ChartCard>

        <section className="card dash-product" aria-label="Service and material split">
          <h3>Service vs Material</h3>
          <div className="mix-grid">
            {productParts.map((p) => {
              const Icon = PRODUCT_ICON[p.key];
              // "Not specified" mixes several raw types, so no single Search filter reproduces it.
              const clickable = p.key !== 'Other';
              const Tile = clickable ? 'button' : 'div';
              return (
                <Tile
                  key={p.key} type={clickable ? 'button' : undefined}
                  className={`mix-tile ${p.key.toLowerCase()}${clickable ? ' clickable' : ''}`}
                  onClick={clickable ? () => openSearchByProduct(p.key) : undefined}
                  aria-label={clickable ? `${p.label}: ${formatCount(p.count)} invoices, open in Search` : undefined}
                >
                  <span className="mix-icon" aria-hidden="true"><Icon size={18} /></span>
                  <span className="mix-name">{p.label}</span>
                  <span className="mix-count">{formatCount(p.count)}</span>
                  <span className="mix-pill">{formatShare(p.count, total)} of invoices</span>
                  <span className="mix-bar" aria-hidden="true"><span style={{ width: `${share(p.count, total) * 100}%`, background: p.color }} /></span>
                  <span className="mix-value" title={exact(p.value)}>{valueOf(p)}</span>
                </Tile>
              );
            })}
          </div>
        </section>
      </div>

      {/* ── 3. Volume over time, and where invoices stand now ── */}
      <div className="dash-charts">
        <ChartCard
          title="Monthly invoices"
          hint={selectedMonth
            ? <>by {dateTypeLabel} · <b>{selectedMonth.label}</b> selected <button type="button" className="chart-clear" onClick={clearMonth}>Clear</button></>
            : `by ${dateTypeLabel} · click a month to open`}
          actions={<InvoiceDateTypeFilter variant="chip" />}
          table={{
            head: ['Month', 'Service', 'Material', 'Not specified', 'Total'],
            rows: m.months.map((x) => [x.label, formatCount(x.Service), formatCount(x.Material), formatCount(x.Other), formatCount(x.Service + x.Material + x.Other)]),
          }}
          note={m.monthsCoverage.inWindow < total
            ? `Last 12 months: ${formatCount(m.monthsCoverage.inWindow)} of ${formatCount(total)} invoices${m.monthsCoverage.withoutDate ? ` (${formatCount(m.monthsCoverage.withoutDate)} have no ${dateTypeLabel})` : ''}.`
            : null}
        >
          {m.months.length
            ? <ColumnChart columns={m.months} label={`Invoices per month by ${dateTypeLabel}, by product type. Click a month to open its invoices`}
              onColumnClick={openMonth} selectedKey={selectedMonth?.key}
              series={productParts.map((p) => ({ key: p.key, label: p.label, color: p.color }))} />
            : <p className="chart-empty">No invoices with a {dateTypeLabel} to chart.</p>}
        </ChartCard>

        <ChartCard
          title="Invoice pipeline" hint="workflow order · click to open"
          table={{
            head: ['Status', 'Invoices', 'Share'],
            rows: m.statuses.map((x) => [x.key, formatCount(x.count), formatShare(x.count, total)]),
            foot: ['Total', formatCount(total), total ? '100%' : '0%'],
          }}
        >
          <RankedBars
            rows={m.statuses.map((x, i) => ({ key: x.key, label: x.key, count: x.count,
              color: x.exception ? EXCEPTION_FILL : flowShade(i, m.statuses.filter((st) => !st.exception).length) }))}
            total={total} onPick={openSearchByStatus}
          />
        </ChartCard>
      </div>

      <div className="card recent-card">
        <h3>Recent Invoices <span className="card-hint">Latest {recentRows.length}</span></h3>
        <RecentInvoices rows={recentRows} />
      </div>
    </div>
  );
}
