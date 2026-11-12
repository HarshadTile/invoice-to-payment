import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { CHANNEL_LABEL } from '../data/constants';
import { useScope } from '../features/ui/scope';
import { selectPerm } from '../features/auth/authSlice';
import { useGetInvoiceDashboardQuery, useGetRecentInvoicesQuery } from '../api/invoicesQueryApi';
import { useInvoiceScopeParams } from '../features/invoices/useInvoiceScopeParams';
import { dashboardMetrics, formatCount, formatMoney, formatShare, share } from '../features/invoices/dashboardMetrics';
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

const RECENT_LIMIT = 5;
// Shown until the first answer arrives: every figure zero, nothing to click.
const NO_METRICS = dashboardMetrics([]);

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

export default function InvoiceTrackingPage() {
  const topScope = useScope();
  // Every figure is totalled on the server for the top-bar scope (fiscal year / channel / vendor).
  const scopeParams = useInvoiceScopeParams();
  const dashboard = useGetInvoiceDashboardQuery(scopeParams);
  const recent = useGetRecentInvoicesQuery({ ...scopeParams, limit: RECENT_LIMIT });
  // Without "Search invoices" the dashboard is view-only: nothing opens Search.
  const canSearch = !!useSelector(selectPerm).createTrace;
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

  // The monthly chart groups by the date type chosen in the filters (shared with Search).
  const dateField = topScope.dateField || 'invoice';
  const dateTypeLabel = invoiceDateTypeLabel(dateField).toLowerCase();
  const m = dashboard.data || NO_METRICS;
  const total = m.total.count;
  const money = (value) => formatMoney(value, m.currency);
  const exact = (value) => formatMoney(value, m.currency, { compact: false });
  /** A bucket's value, or a plain note when none of its invoices has an amount on record. */
  const valueOf = (bucket) => (bucket.valued ? money(bucket.value) : 'No amount on record');

  const recentRows = recent.data || [];

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
      onClick={canSearch ? () => openSearchByStatus(status) : undefined}
    />
  );

  if (dashboard.isError && !dashboard.data) {
    return (
      <div className="card empty-state" role="alert">
        <b>The dashboard could not be loaded</b>
        <span>{dashboard.error?.message || 'Check the connection and try again.'}</span>
        <button type="button" className="btn" onClick={() => dashboard.refetch()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="dash" aria-busy={dashboard.isFetching}>
      {dashboard.isLoading && <p role="status" className="chart-note">Loading the dashboard…</p>}
      {/* ── 1. Headline numbers ── */}
      <div className="kpi-grid">
        <StatCard
          tone="shade-total" label="Total Invoices" value={formatCount(total)} icon={<FileText size={16} />} sub="All statuses in this selection"
          foot={<><span title={exact(m.total.value)}><b>{valueOf(m.total)}</b> total value</span> · {formatCount(exceptions)} rejected / deleted</>}
          onClick={canSearch ? () => openSearchByStatus('') : undefined}
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
              const clickable = canSearch && p.key !== 'Other';
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
              onColumnClick={canSearch ? openMonth : undefined} selectedKey={selectedMonth?.key}
              series={productParts.map((p) => ({ key: p.key, label: p.label, color: p.color }))} />
            : <p className="chart-empty">Nothing to chart: no {dateTypeLabel} is recorded on these invoices.</p>}
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
            total={total} onPick={canSearch ? openSearchByStatus : undefined}
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
