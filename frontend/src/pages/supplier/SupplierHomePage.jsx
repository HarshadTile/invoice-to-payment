import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { runtime } from '../../data/runtime';
import { CHANNEL_STAGES, CHANNEL_LABEL } from '../../data/constants';
import { combinedStatusFor, currentHandlerFor, getFiscalYear, stageProgress } from '../../utils/businessLogic';
import { selectScopedInvoices } from '../../features/invoices/selectors';
import { setSupplierHomeTab, openModal } from '../../features/ui/uiSlice';
import InvoiceTable from '../../components/invoices/InvoiceTable.jsx';
import StatCard from '../../components/common/StatCard.jsx';

export default function SupplierHomePage() {
  const dispatch = useDispatch();
  const invoices = useSelector(selectScopedInvoices);
  const { vcode: code, company: supplier, pan: supplierPAN } = useSelector((s) => s.auth);
  const activeTab = useSelector((s) => s.ui.supplierHomeTab) || 'current';
  const [activeKpi, setActiveKpi] = useState('total');
  const [searchParams] = useSearchParams();
  const invoiceSearch = searchParams.get('invoice_number') || '';
  const poSearch = searchParams.get('po_number') || '';
  const poItemSearch = searchParams.get('po_item') || '';
  const fySearch = searchParams.get('fy') || getFiscalYear(new Date().toISOString());

  const codeInvoices = invoices.filter((i) => {
    if (i.vcode !== code) return false;
    const invoiceMatches = !invoiceSearch.trim() || i.no.toLowerCase().includes(invoiceSearch.trim().toLowerCase());
    const poMatches = !poSearch.trim() || i.po.toLowerCase().includes(poSearch.trim().toLowerCase());
    const itemMatches = !poItemSearch.trim() || String(i.poItem) === poItemSearch.trim();
    const fyMatches = fySearch === 'all' || getFiscalYear(i.date) === fySearch;
    return invoiceMatches && poMatches && itemMatches && fyMatches;
  });
  const inProgress = codeInvoices.filter((i) => !['Paid', 'Rejected', 'Deleted'].includes(i.status));
  const byLabel = {};
  codeInvoices.forEach((inv) => { const l = combinedStatusFor(inv).label; byLabel[l] = (byLabel[l] || 0) + 1; });
  const pan = invoices.find((invoice) => invoice.vcode === code)?.pan || supplierPAN || '-';
  const kpiFilters = {
    total: codeInvoices,
    paid: codeInvoices.filter((i) => combinedStatusFor(i).label === 'Fully Paid'),
    rejected: codeInvoices.filter((i) => combinedStatusFor(i).label === 'Rejected'),
    approval: codeInvoices.filter((i) => combinedStatusFor(i).label === 'In Approval'),
  };
  const kpiInvoices = kpiFilters[activeKpi] || codeInvoices;
  const displayedCurrentInvoices = activeKpi === 'total' ? inProgress : kpiInvoices;
  const displayedAllInvoices = activeKpi === 'total' ? codeInvoices : kpiInvoices;
  const selectKpi = (id) => setActiveKpi((current) => (current === id ? 'total' : id));

  return (
    <>
      <div className="supplier-kpis">
        <SupplierKpi label="Total Invoices" value={codeInvoices.length} onClick={() => setActiveKpi('total')} active={activeKpi === 'total'} />
        <SupplierKpi label="Fully Paid" value={byLabel['Fully Paid'] || 0} onClick={() => selectKpi('paid')} active={activeKpi === 'paid'} />
        <SupplierKpi label="Rejected" value={byLabel['Rejected'] || 0} tone="red" onClick={() => selectKpi('rejected')} active={activeKpi === 'rejected'} />
        <SupplierKpi label="In Approval" value={byLabel['In Approval'] || 0} onClick={() => selectKpi('approval')} active={activeKpi === 'approval'} />
      </div>

      <div className="sheet-carousel" style={{ marginBottom: 14 }}>
        <div className="car-track">
          <button type="button" className={`car-chip${activeTab === 'current' ? ' active' : ''}`} onClick={() => dispatch(setSupplierHomeTab('current'))}>Current Invoice{displayedCurrentInvoices.length ? ` (${displayedCurrentInvoices.length})` : ''}</button>
          <button type="button" className={`car-chip${activeTab === 'all' ? ' active' : ''}`} onClick={() => dispatch(setSupplierHomeTab('all'))}>All Invoices ({displayedAllInvoices.length})</button>
        </div>
      </div>

      {activeTab === 'current' ? (
        displayedCurrentInvoices.length ? displayedCurrentInvoices.map((inv, rowIndex) => <CurrentInvoiceCard key={`${inv.no}-${rowIndex}`} inv={inv} />) : (
          <div className="card"><p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>Nothing currently in progress on {code} right now. Everything is either fully closed out or has not started yet. Check the All Invoices tab.</p></div>
        )
      ) : (
        <div className="card"><InvoiceTable invoices={displayedAllInvoices} tableKey={`supplierAllInvoices-${activeKpi}`} mode="supplierSafe" /></div>
      )}
    </>
  );
}

function SupplierKpi({ label, value, tone = '', onClick, active }) {
  return (
    <StatCard
      label={label}
      value={value}
      tone={tone}
      onClick={onClick}
      active={active}
    />
  );
}

function displayDate(value) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const LADDER = ['Invoice Uploaded', 'Pending Approval', 'Approved', 'Miro Booked', 'Payment Due', 'Paid'];

function CurrentInvoiceCard({ inv }) {
  const dispatch = useDispatch();
  const stages = LADDER;
  const currentIndex = stages.indexOf(inv.status);
  const done = inv.status === 'Rejected' || inv.status === 'Deleted' ? 1 : (currentIndex >= 0 ? currentIndex + 1 : 1);
  const cs = combinedStatusFor(inv);
  const contact = currentHandlerFor(inv);

  const getStageDate = (stage) => {
    switch (stage) {
      case 'Invoice Uploaded':
        return displayDate(inv.rawDate);
      case 'Pending Approval':
        return null;
      case 'Approved':
        return displayDate(inv.workflow?.final_approval_date);
      case 'Miro Booked':
        return displayDate(inv.sap?.document_date || inv.sap?.posting_date);
      case 'Payment Due':
        return displayDate(inv.sap?.net_due_date);
      case 'Paid':
        return inv.utr && inv.utr !== '-' ? `${displayDate(inv.sap?.clearing_date)} (${inv.utr})` : displayDate(inv.sap?.clearing_date);
      default:
        return null;
    }
  };

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <div>
          <button type="button" className="link-hero" style={{ fontSize: 15 }} onClick={() => dispatch(openModal({ kind: 'supplierInvoiceDetail', ctx: { no: inv.no } }))}>{inv.no}</button>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{CHANNEL_LABEL[inv.channel]} : PO {inv.po} : {inv.amount}</div>
        </div>
        <span className={`chip ${cs.tone}`}>{cs.label}</span>
      </div>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Invoice Progress</label>
      <div style={{ display: 'flex', alignItems: 'flex-start', margin: '10px 0 4px', overflowX: 'auto' }}>
        {stages.map((s, i) => {
          const idx = i + 1;
          const st = idx < done ? 'done' : idx === done ? 'current' : 'todo';
          const dotBg = st === 'done' ? 'var(--green)' : st === 'current' ? 'var(--blue)' : '#E2E8F0';
          const dotFg = st === 'todo' ? 'var(--text-muted)' : '#fff';
          const dateStr = getStageDate(s);
          return (
            <div key={i} style={{ flex: 1, minWidth: 88, textAlign: 'center', position: 'relative' }}>
              {i > 0 && <div style={{ position: 'absolute', top: 11, left: '-50%', width: '100%', height: 2, background: idx <= done ? 'var(--blue)' : '#E2E8F0', zIndex: 0 }} />}
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: dotBg, color: dotFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, margin: '0 auto', position: 'relative', zIndex: 1 }}>{st === 'done' ? '✓' : idx}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.3 }}>{s}</div>
              {dateStr && <div style={{ fontSize: 9.5, color: 'var(--text)', fontWeight: 600, marginTop: 3 }}>{dateStr}</div>}
            </div>
          );
        })}
      </div>
      <div className="validation-row" style={{ marginTop: 10 }}><span>UTR No.</span><span>{inv.utr === '-' ? <span style={{ color: '#CBD5E1' }}>Not yet visible</span> : inv.utr}</span></div>
      {inv.shortPayReason && <div className="validation-row"><span>Reason for Less Paid</span><span style={{ textAlign: 'right', maxWidth: 280 }}>{inv.shortPayReason}</span></div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="button" className="btn" onClick={() => dispatch(openModal({ kind: 'raiseTicket', ctx: { no: inv.no } }))}>Raise a Query</button>
        <button type="button" className="btn" onClick={() => dispatch(openModal({ kind: 'supplierInvoiceDetail', ctx: { no: inv.no } }))}>View Full Detail</button>
      </div>
    </div>
  );
}
