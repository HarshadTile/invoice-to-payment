import { useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useScope } from '../../features/ui/scope';
import { openModal } from '../../features/ui/uiSlice';
import { useGetTicketSummaryQuery } from '../../features/tickets/ticketsApi';
import { formatCount, formatMoney, formatShare, share } from '../../features/invoices/dashboardMetrics';
import { UPCOMING_DAYS, supplierMetrics } from '../../features/invoices/supplierMetrics';
import { formatInvoiceDate, invoiceDateTypeLabel, monthDateRange } from '../../utils/invoiceDates';
import useSupplierInvoices from './useSupplierInvoices';
import StatCard from '../../components/common/StatCard.jsx';
import ChartCard from '../../components/dashboard/ChartCard.jsx';
import ColumnChart from '../../components/dashboard/ColumnChart.jsx';
import RankedBars from '../../components/dashboard/RankedBars.jsx';
import InvoiceDateTypeFilter from '../../components/invoices/InvoiceDateTypeFilter.jsx';
import {
  AlertTriangle, Banknote, Calendar, CheckCircle, Clock, FileText, Layers, MessageSquare, X,
} from '../../components/common/icons.jsx';

const LIST_LIMIT = 5;
// Same validated red / rose / neutral set as the internal dashboard.
const MONTH_SERIES = [
  { key: 'Paid', label: 'Paid', color: '#C8102E' },
  { key: 'Open', label: 'In progress', color: '#E8909C' },
  { key: 'Rejected', label: 'Rejected', color: '#9A9DA4' },
];
const EXCEPTION_FILL = '#9A9DA4';

function flowShade(index, count) {
  const from = [232, 144, 156];
  const to = [110, 10, 25];
  const t = count > 1 ? index / (count - 1) : 1;
  const mix = (k) => Math.round(from[k] + (to[k] - from[k]) * t);
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}

const dueTag = (days) => (days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `In ${days} days`);

export default function SupplierDashboardPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const invoices = useSupplierInvoices();
  const dateField = useScope().dateField || 'invoice';
  const dateTypeLabel = invoiceDateTypeLabel(dateField).toLowerCase();
  const m = useMemo(() => supplierMetrics(invoices, dateField), [invoices, dateField]);
  const { data: queries = {} } = useGetTicketSummaryQuery(undefined, { pollingInterval: 30000, skipPollingIfUnfocused: true });

  const total = m.kpi.total.count;
  const money = (value) => formatMoney(value, m.currency);
  const exact = (value) => formatMoney(value, m.currency, { compact: false });
  const valueOf = (b) => (b.valued ? money(b.value) : 'No amount on record');

  /** Open My Invoices narrowed the same way as the number clicked. */
  const openList = (params) => navigate(`/supplier/home?${new URLSearchParams(params).toString()}`);
  const openInvoice = (inv) => openList({ open: inv.no, ...(inv.poItem !== undefined && inv.poItem !== '' ? { item: String(inv.poItem) } : {}) });
  const raiseQuery = (inv) => dispatch(openModal({ kind: 'raiseTicket', ctx: { no: inv.no, poItem: inv.poItem, vcode: inv.vcode, po: inv.po, channel: inv.channel, sourceId: inv.sourceId } }));

  const kpiCard = (id, label, icon, sub, tone) => (
    <StatCard
      tone={tone} label={label} value={formatCount(m.kpi[id].count)} icon={icon} sub={sub}
      meter={id === 'total' ? undefined : share(m.kpi[id].count, total)}
      foot={id === 'total'
        ? <span title={exact(m.kpi.total.value)}><b>{valueOf(m.kpi.total)}</b> total value</span>
        : <><b>{formatShare(m.kpi[id].count, total)}</b> · <span title={exact(m.kpi[id].value)}>{valueOf(m.kpi[id])}</span></>}
      onClick={() => openList({ kpi: id })}
    />
  );
  const statusRows = m.statuses.filter((s) => !s.exception);

  return (
    <div className="dash supplier-dash">
      {/* ── 1. Where my invoices stand ── */}
      <div className="kpi-grid supplier-dash-kpis">
        {kpiCard('total', 'Total Invoices', <FileText size={16} />, 'All your invoices in this selection', 'shade-total')}
        {kpiCard('progress', 'In Progress', <Clock size={16} />, 'Not yet paid or rejected', 'shade-pending')}
        {kpiCard('awaiting', 'Awaiting Payment', <Layers size={16} />, 'Approved / booked in SAP', 'shade-approved')}
        {kpiCard('paid', 'Fully Paid', <Banknote size={16} />, 'Payment cleared', 'shade-paid')}
        {kpiCard('rejected', 'Rejected', <X size={16} />, 'Needs a corrected invoice', 'shade-miro')}
      </div>

      {/* ── 2. Money ── */}
      <div className="sd-money" aria-label="Payments summary">
        <div className="sd-money-tile">
          <span className="sd-money-ic received"><CheckCircle size={16} /></span>
          <span className="sd-money-lbl">Amount received</span>
          <b title={exact(m.kpi.paid.value)}>{m.kpi.paid.valued ? money(m.kpi.paid.value) : '-'}</b>
          <small>{formatCount(m.kpi.paid.count)} paid invoice{m.kpi.paid.count === 1 ? '' : 's'}</small>
        </div>
        <button type="button" className="sd-money-tile clickable" onClick={() => openList({ kpi: 'awaiting' })}>
          <span className="sd-money-ic outstanding"><Layers size={16} /></span>
          <span className="sd-money-lbl">Outstanding</span>
          <b title={exact(m.kpi.awaiting.value)}>{m.kpi.awaiting.valued ? money(m.kpi.awaiting.value) : '-'}</b>
          <small>Approved, payment pending</small>
        </button>
        <button type="button" className={`sd-money-tile clickable${m.kpi.overdue.count ? ' alert' : ''}`} onClick={() => openList({ kpi: 'overdue' })}>
          <span className="sd-money-ic overdue"><AlertTriangle size={16} /></span>
          <span className="sd-money-lbl">Overdue</span>
          <b>{formatCount(m.kpi.overdue.count)}</b>
          <small>{m.kpi.overdue.count ? <>past due date · <span title={exact(m.kpi.overdue.value)}>{valueOf(m.kpi.overdue)}</span></> : 'Nothing past its due date'}</small>
        </button>
        <div className="sd-money-tile">
          <span className="sd-money-ic speed"><Calendar size={16} /></span>
          <span className="sd-money-lbl">Avg. days to payment</span>
          <b>{m.avgDaysToPay == null ? '-' : `${m.avgDaysToPay} days`}</b>
          <small>{m.onTime ? `${formatShare(m.onTime.count, m.onTime.of)} paid by the due date` : 'Invoice date to payment date'}</small>
        </div>
      </div>

      {/* ── 3. Trend and pipeline ── */}
      <div className="dash-charts">
        <ChartCard
          title="Monthly invoices" hint={`by ${dateTypeLabel} · click a month to open`}
          actions={<InvoiceDateTypeFilter variant="chip" />}
          table={{
            head: ['Month', 'Paid', 'In progress', 'Rejected', 'Total'],
            rows: m.months.map((x) => [x.label, formatCount(x.Paid), formatCount(x.Open), formatCount(x.Rejected), formatCount(x.Paid + x.Open + x.Rejected)]),
          }}
          note={m.months.length && m.monthsInWindow < total ? `Last 12 months: ${formatCount(m.monthsInWindow)} of ${formatCount(total)} invoices.` : null}
        >
          {m.months.length
            ? <ColumnChart columns={m.months} series={MONTH_SERIES} label={`Your invoices per month by ${dateTypeLabel}. Click a month to open its invoices`}
              onColumnClick={(column) => { const { from, to } = monthDateRange(column.key); openList({ date_from: from, date_to: to }); }} />
            : <p className="chart-empty">No invoices with a {dateTypeLabel} to chart.</p>}
        </ChartCard>

        <ChartCard
          title="Where my invoices are" hint="workflow order · click to open"
          table={{
            head: ['Status', 'Invoices', 'Share'],
            rows: m.statuses.map((x) => [x.key, formatCount(x.count), formatShare(x.count, total)]),
            foot: ['Total', formatCount(total), total ? '100%' : '0%'],
          }}
        >
          {m.statuses.length ? (
            <RankedBars
              rows={m.statuses.map((x) => ({ key: x.key, label: x.key, count: x.count,
                color: x.exception ? EXCEPTION_FILL : flowShade(statusRows.indexOf(x), statusRows.length) }))}
              total={total} onPick={(status) => openList({ status })} pickHint="open in My Invoices"
            />
          ) : <p className="chart-empty">No invoices for this selection.</p>}
        </ChartCard>
      </div>

      {/* ── 4. What needs a look ── */}
      <div className="sd-lists">
        <DashList
          icon={<Calendar size={15} />} title="Upcoming payments" hint={`due in the next ${UPCOMING_DAYS} days`}
          count={m.upcoming.length} onViewAll={() => openList({ kpi: 'upcoming' })}
          empty="No payments due in the next 30 days."
        >
          {m.upcoming.slice(0, LIST_LIMIT).map(({ inv, due, daysLeft }, i) => (
            <li key={`${inv.no}-${inv.poItem}-${i}`}>
              <div className="sd-row-main">
                <button type="button" className="link-hero" onClick={() => openInvoice(inv)}>{inv.no}</button>
                <small>PO {inv.po} · due {formatInvoiceDate(due)}</small>
              </div>
              <div className="sd-row-side">
                <b>{inv.amount && inv.amount !== '-' ? inv.amount : ''}</b>
                <span className={`sd-tag${daysLeft <= 7 ? ' soon' : ''}`}>{dueTag(daysLeft)}</span>
              </div>
            </li>
          ))}
        </DashList>

        <DashList
          icon={<AlertTriangle size={15} />} title="Needs attention" hint="rejected invoices"
          count={m.rejected.length} onViewAll={() => openList({ kpi: 'rejected' })}
          empty="Nothing rejected. All good!"
        >
          {m.rejected.slice(0, LIST_LIMIT).map((inv, i) => (
            <li key={`${inv.no}-${inv.poItem}-${i}`}>
              <div className="sd-row-main">
                <button type="button" className="link-hero" onClick={() => openInvoice(inv)}>{inv.no}</button>
                <small className="sd-reason" title={inv.rejectionReason || inv.workflow?.rejection_reason || ''}>
                  {inv.rejectionReason || inv.workflow?.rejection_reason || 'No reason recorded'}
                </small>
              </div>
              <div className="sd-row-side">
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => raiseQuery(inv)}>Raise a query</button>
              </div>
            </li>
          ))}
        </DashList>

        <DashList
          icon={<Banknote size={15} />} title="Recent payments" hint="latest cleared"
          count={m.recentPaid.length} onViewAll={() => openList({ kpi: 'paid' })}
          empty="No payments yet in this selection."
        >
          {m.recentPaid.slice(0, LIST_LIMIT).map(({ inv, paidOn }, i) => (
            <li key={`${inv.no}-${inv.poItem}-${i}`}>
              <div className="sd-row-main">
                <button type="button" className="link-hero" onClick={() => openInvoice(inv)}>{inv.no}</button>
                <small>{inv.utr && inv.utr !== '-' ? `UTR ${inv.utr}` : 'UTR not yet visible'}</small>
              </div>
              <div className="sd-row-side">
                <b>{inv.amount && inv.amount !== '-' ? inv.amount : ''}</b>
                <span className="sd-tag paid">{paidOn ? formatInvoiceDate(paidOn) : 'Paid'}</span>
              </div>
            </li>
          ))}
        </DashList>
      </div>

      {/* ── 5. Queries ── */}
      <button type="button" className="card sd-queries" onClick={() => navigate('/supplier/tickets')}>
        <span className="sd-money-ic outstanding"><MessageSquare size={16} /></span>
        <span className="sd-queries-text"><b>My Queries</b><small>Questions you raised about your invoices</small></span>
        <span className="sd-queries-stat"><b>{formatCount(queries.open || 0)}</b>open</span>
        <span className="sd-queries-stat"><b>{formatCount(queries.in_progress || 0)}</b>in progress</span>
        <span className="sd-queries-stat"><b>{formatCount(queries.resolved_closed || 0)}</b>resolved</span>
      </button>
    </div>
  );
}

function DashList({ icon, title, hint, count, onViewAll, empty, children }) {
  return (
    <section className="card sd-list" aria-label={title}>
      <div className="sd-list-head">
        <h3><span className="sd-list-ic" aria-hidden="true">{icon}</span>{title}{count > 0 && <span className="reports-count">{formatCount(count)}</span>}</h3>
        {count > 0 && <button type="button" className="chart-clear" onClick={onViewAll} aria-label={`View all ${title.toLowerCase()}`}>View all</button>}
      </div>
      <span className="card-hint sd-list-hint">{hint}</span>
      {count ? <ul>{children}</ul> : <p className="chart-empty">{empty}</p>}
    </section>
  );
}
