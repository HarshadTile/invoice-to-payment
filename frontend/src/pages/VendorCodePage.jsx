import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CHANNEL_LABEL, CHANNEL_SYNC_LABELS } from '../data/constants';
import { runtime } from '../data/runtime';
import { supplierForVendorCode, panFor, vendorCodesFor, posForVendorCode, getInvoiceHistory } from '../utils/businessLogic';
import { selectFilteredInvoicesAnyVendor } from '../features/invoices/selectors';
import { totalsByCurrency } from '../utils/amounts';
import { setVcodeViewTab, openModal } from '../features/ui/uiSlice';
import InvoiceTable from '../components/invoices/InvoiceTable.jsx';
import InvoiceFilterBar, { defaultInvoiceRange, invoiceYMD } from '../components/invoices/InvoiceFilterBar.jsx';
import Timeline from '../components/common/Timeline.jsx';
import { useGetTicketsQuery } from '../features/tickets/ticketsApi';

const VCODE_VIEWS = ['Invoice Log', 'History'];

/** Status + date-range filter (same one used on My Invoices / Search Invoice(s)), scoped to this vendor code's invoices. */
function useVendorInvoiceFilter(invoices) {
  const [searchParams, setSearchParams] = useSearchParams();
  const range = defaultInvoiceRange();
  const status = searchParams.get('status') || '';
  const dateFrom = searchParams.has('date_from') ? searchParams.get('date_from') : range.from;
  const dateTo = searchParams.has('date_to') ? searchParams.get('date_to') : range.to;

  const update = (changes) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([k, v]) => { if (v === null) next.delete(k); else next.set(k, v); });
    setSearchParams(next, { replace: true });
  };

  const inRange = invoices.filter((i) => {
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

export default function VendorCodePage() {
  const { code } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { authType, channelScope } = useSelector((s) => s.auth);
  // top-bar fiscal year / channel apply; the vendor code is this page's own
  const scoped = useSelector(selectFilteredInvoicesAnyVendor);
  const savedTab = useSelector((s) => s.ui.vcodeViewTab[code]);
  const { data: ticketPage } = useGetTicketsQuery({ vendor_code: code, page_size: 100 });
  const openIssues = (ticketPage?.items || []).filter((t) => ['OPEN', 'IN_PROGRESS'].includes(t.status)).length;

  const supplier = supplierForVendorCode(code);
  const siblingCodes = vendorCodesFor(supplier).filter((c) => c !== code);
  const invoices = scoped.filter((i) => i.vcode === code);
  // The header stats above always cover every invoice on this code; the filter bar below only narrows the Invoice Log table.
  const { shown: filteredInvoices, bar: invoiceFilterBar } = useVendorInvoiceFilter(invoices);
  const byPO = posForVendorCode(code);
  const poCount = Object.keys(byPO).length;
  const paid = invoices.filter((i) => i.status === 'Paid').length;
  const due = invoices.filter((i) => i.status === 'Payment Due').length;
  const inProgress = invoices.length - paid - due - invoices.filter((i) => i.status === 'Rejected' || i.status === 'Deleted').length;
  const byCurrency = totalsByCurrency(invoices);

  const activeView = savedTab && VCODE_VIEWS.includes(savedTab) ? savedTab : VCODE_VIEWS[0];
  const isSupplier = authType === 'supplier';
  const canOpenFullVisibility = !isSupplier && channelScope === 'all';

  return (
    <>
      <div className="card" style={{ marginBottom: 12, padding: '12px 18px' }}>
        <div className="row" style={{ gap: 12 }}>
          <div className="form-field" style={{ flex: 1, marginBottom: 0 }}><label>Supplier Name</label><input value={supplier} readOnly /></div>
          <div className="form-field" style={{ flex: 1, marginBottom: 0 }}><label>PAN</label><input value={panFor(supplier)} readOnly /></div>
        </div>
        {!isSupplier && siblingCodes.length > 0 && (
          <>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', display: 'block', marginTop: 10 }}>
              Other Codes for {supplier} ({siblingCodes.length}) : separate scope, not shown here
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {siblingCodes.map((c) => (
                <button key={c} type="button" className="chip gray mono" style={{ cursor: 'pointer', border: 'none' }} onClick={() => navigate(`/app/vendor-code/${c}`)}>{c}</button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="row" style={{ marginBottom: 12, gap: 10 }}>
        <div className="stat-card" style={{ minWidth: 0 }}><div className="lbl">Total Invoices</div><div className="val">{invoices.length}</div></div>
        <div className="stat-card" style={{ minWidth: 0 }}><div className="lbl">Total POs</div><div className="val">{poCount}</div></div>
        <div className="stat-card" style={{ minWidth: 0 }}><div className="lbl">Total Amount</div><div className="val" style={{ fontSize: 15 }}>{Object.entries(byCurrency).map(([c, v]) => `${c}${v.toLocaleString('en-IN')}`).join(' + ') || '-'}</div></div>
        <div className="stat-card" style={{ minWidth: 0 }}><div className="lbl">Paid</div><div className="val">{paid}</div></div>
        <div className="stat-card warn" style={{ minWidth: 0 }}><div className="lbl">Payment Due</div><div className="val">{due}</div></div>
        <div className="stat-card" style={{ minWidth: 0 }}><div className="lbl">In Progress</div><div className="val">{Math.max(0, inProgress)}</div></div>
        <div className={`stat-card${openIssues ? ' bad' : ''}`} style={{ minWidth: 0 }}><div className="lbl">Open Issues</div><div className="val">{openIssues}</div></div>
      </div>

      <div className="sheet-carousel" style={{ marginBottom: 10 }}>
        <div className="car-track">
          {VCODE_VIEWS.map((v) => (
            <button type="button" key={v} className={`car-chip${v === activeView ? ' active' : ''}`} onClick={() => dispatch(setVcodeViewTab({ code, view: v }))}>{v}</button>
          ))}
        </div>
        {canOpenFullVisibility && (
          <button type="button" className="btn" style={{ flexShrink: 0 }} onClick={() => navigate('/app/supplier-visibility')}>Open full Supplier Visibility →</button>
        )}
      </div>

      {activeView === 'Invoice Log' ? (
        <>
          {invoiceFilterBar}
          <div className="card"><InvoiceTable invoices={filteredInvoices} tableKey={`vendorCodePage-${code}`} mode="supplierSafe" /></div>
        </>
      ) : (
        <VendorCodeHistory code={code} invoices={invoices} />
      )}
    </>
  );
}

function VendorCodeHistory({ code, invoices }) {
  const dispatch = useDispatch();
  const { data: ticketPage } = useGetTicketsQuery({ vendor_code: code, include_closed: true, page_size: 100 });
  const done = invoices.filter((i) => i.status === 'Paid').length;
  const failed = invoices.filter((i) => i.status === 'Rejected' || i.status === 'Deleted').length;
  const ongoing = invoices.length - done - failed;
  const channelsUsed = [...new Set(invoices.map((i) => i.channel))];
  const syncLabels = channelsUsed.flatMap((k) => CHANNEL_SYNC_LABELS[k] || []);
  const rows = runtime.syncLog.filter((s) => syncLabels.includes(s.channel));

  return (
    <>
      <div className="row" style={{ marginBottom: 18 }}>
        <div className="stat-card" style={{ minWidth: 0 }}><div className="lbl">{code} : Total Invoices</div><div className="val">{invoices.length}</div></div>
        <div className="stat-card" style={{ minWidth: 0 }}><div className="lbl">Completed / Done</div><div className="val">{done}</div></div>
        <div className="stat-card warn" style={{ minWidth: 0 }}><div className="lbl">Currently In Progress</div><div className="val">{Math.max(0, ongoing)}</div></div>
        <div className="stat-card bad" style={{ minWidth: 0 }}><div className="lbl">Failed</div><div className="val">{failed}</div></div>
      </div>
      <div className="card" style={{ marginBottom: 18 }}>
        <h3>Data Sync Log : portals used by {code}</h3>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Source</th><th>Time</th><th>Status</th><th>Records</th><th>Message</th></tr></thead>
            <tbody>
              {rows.length ? rows.map((s, i) => (
                <tr key={i}><td>{s.channel}</td><td>{s.time}</td><td><span className={`chip ${s.status === 'Success' ? 'green' : 'red'}`}>{s.status}</span></td><td>{s.records}</td><td>{s.msg}</td></tr>
              )) : <tr><td colSpan={5} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 18 }}>No sync runs logged for this vendor code's portals yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', display: 'block', marginBottom: 8 }}>Invoice History : {code}</label>
      {invoices.length ? invoices.map((inv, rowIndex) => (
        <div className="card" style={{ marginBottom: 12 }} key={`${inv.no}-${rowIndex}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <button type="button" className="link-hero" style={{ fontWeight: 700 }} onClick={() => dispatch(openModal({ kind: 'invoiceDetail', ctx: { no: inv.no, poItem: inv.poItem } }))}>{inv.no}</button>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{CHANNEL_LABEL[inv.channel]} · PO {inv.po}</span>
          </div>
        <Timeline events={getInvoiceHistory(inv, ticketPage?.items || [])} />
        </div>
      )) : <p style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>No invoices on this code yet.</p>}
    </>
  );
}
