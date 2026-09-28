import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { VENDOR_CODE_MAP, CHANNEL_LABEL, CHANNEL_SYNC_LABELS } from '../data/constants';
import { runtime } from '../data/runtime';
import { supplierForVendorCode, panFor, posForVendorCode, getInvoiceHistory, ticketInvoice } from '../utils/businessLogic';
import { selectScopedInvoices } from '../features/invoices/selectors';
import { setVcodeViewTab, openModal } from '../features/ui/uiSlice';
import InvoiceTable from '../components/invoices/InvoiceTable.jsx';
import Timeline from '../components/common/Timeline.jsx';

const VCODE_VIEWS = ['Invoice Log', 'History'];

export default function VendorCodePage() {
  const { code } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { authType, channelScope } = useSelector((s) => s.auth);
  const scoped = useSelector(selectScopedInvoices);
  const savedTab = useSelector((s) => s.ui.vcodeViewTab[code]);
  const ticketItems = useSelector((s) => s.tickets.items);
  const openIssues = ticketItems.filter((t) => ticketInvoice(t)?.vcode === code).filter((t) => t.status === 'Open' || t.status === 'In Progress').length;

  const supplier = supplierForVendorCode(code);
  const siblingCodes = VENDOR_CODE_MAP.rows.filter((r) => r[1] === supplier).map((r) => r[0]).filter((c) => c !== code);
  const invoices = scoped.filter((i) => i.vcode === code);
  const byPO = posForVendorCode(code);
  const poCount = Object.keys(byPO).length;
  const paid = invoices.filter((i) => i.status === 'Paid').length;
  const due = invoices.filter((i) => i.status === 'Payment Due').length;
  const inProgress = invoices.length - paid - due - invoices.filter((i) => i.status === 'Rejected' || i.status === 'Deleted').length;
  const byCurrency = {};
  invoices.forEach((i) => { const cur = i.amount[0]; byCurrency[cur] = (byCurrency[cur] || 0) + parseFloat(i.amount.slice(1).replace(/,/g, '')); });

  const activeView = savedTab && VCODE_VIEWS.includes(savedTab) ? savedTab : VCODE_VIEWS[0];
  const isSupplier = authType === 'supplier';
  const canOpenFullVisibility = !isSupplier && channelScope === 'all';

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', fontWeight: 700 }}>Vendor Code</div>
          <h1 className="page-title mono" style={{ marginTop: 2 }}>{code}</h1>
        </div>
        {canOpenFullVisibility && (
          <button type="button" className="btn" onClick={() => navigate('/app/supplier-visibility')}>Open full Supplier Visibility →</button>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <div className="form-field" style={{ flex: 1 }}><label>Supplier Name</label><input value={supplier} readOnly /></div>
          <div className="form-field" style={{ flex: 1 }}><label>PAN</label><input value={panFor(supplier)} readOnly /></div>
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

      <div className="row" style={{ marginBottom: 16 }}>
        <div className="stat-card" style={{ minWidth: 0 }}><div className="lbl">Total Invoices</div><div className="val">{invoices.length}</div></div>
        <div className="stat-card" style={{ minWidth: 0 }}><div className="lbl">Total POs</div><div className="val">{poCount}</div></div>
        <div className="stat-card" style={{ minWidth: 0 }}><div className="lbl">Total Amount</div><div className="val" style={{ fontSize: 15 }}>{Object.entries(byCurrency).map(([c, v]) => `${c}${v.toLocaleString('en-IN')}`).join(' + ') || '-'}</div></div>
        <div className="stat-card" style={{ minWidth: 0 }}><div className="lbl">Paid</div><div className="val">{paid}</div></div>
        <div className="stat-card warn" style={{ minWidth: 0 }}><div className="lbl">Payment Due</div><div className="val">{due}</div></div>
        <div className="stat-card" style={{ minWidth: 0 }}><div className="lbl">In Progress</div><div className="val">{Math.max(0, inProgress)}</div></div>
        <div className={`stat-card${openIssues ? ' bad' : ''}`} style={{ minWidth: 0 }}><div className="lbl">Open Issues</div><div className="val">{openIssues}</div></div>
      </div>

      <div className="sheet-carousel" style={{ marginBottom: 14 }}>
        <div className="car-track">
          {VCODE_VIEWS.map((v) => (
            <button type="button" key={v} className={`car-chip${v === activeView ? ' active' : ''}`} onClick={() => dispatch(setVcodeViewTab({ code, view: v }))}>{v}</button>
          ))}
        </div>
      </div>

      {activeView === 'Invoice Log' ? (
        <>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '-4px 0 14px' }}>
            {code}'s own invoices: one vendor code, several purchase orders ({poCount}), each kept as its own record with its own Invoice No, PO No, Channel, Status, Current Stage, Handled By and UTR. Search below covers only this code.
          </p>
          <div className="card"><InvoiceTable invoices={invoices} tableKey={`vendorCodePage-${code}`} mode="supplierSafe" /></div>
        </>
      ) : (
        <VendorCodeHistory code={code} invoices={invoices} />
      )}
    </>
  );
}

function VendorCodeHistory({ code, invoices }) {
  const dispatch = useDispatch();
  const tickets = useSelector((s) => s.tickets.items);
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
            <button type="button" className="link-hero" style={{ fontWeight: 700 }} onClick={() => dispatch(openModal({ kind: 'invoiceDetail', ctx: { no: inv.no } }))}>{inv.no}</button>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{CHANNEL_LABEL[inv.channel]} · PO {inv.po}</span>
          </div>
          <Timeline events={getInvoiceHistory(inv, tickets)} />
        </div>
      )) : <p style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>No invoices on this code yet.</p>}
    </>
  );
}
