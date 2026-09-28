import { useDispatch, useSelector } from 'react-redux';
import { selectScopedInvoices } from '../../features/invoices/selectors';
import { getFiscalYear } from '../../utils/businessLogic';
import { useSearchParams } from 'react-router-dom';
import { CHANNEL_LABEL } from '../../data/constants';
import { activityLogRows } from '../../utils/businessLogic';
import { openModal } from '../../features/ui/uiSlice';

export default function SupplierLogsPage() {
  const dispatch = useDispatch();
  const code = useSelector((s) => s.auth.supplierLoginVcode);
  const [searchParams] = useSearchParams();
  const fySearch = searchParams.get('fy') || getFiscalYear(new Date().toISOString());
  const scopedInvoices = useSelector(selectScopedInvoices);
  const invoices = scopedInvoices.filter((i) => i.vcode === code && (fySearch === 'all' || getFiscalYear(i.date) === fySearch));
  const done = invoices.filter((i) => i.status === 'Paid');
  const activityRows = activityLogRows(invoices);

  return (
    <>
      <h1 className="page-title">Logs : {code}</h1>
      <p className="page-sub">Review every invoice activity and closed payment record for this vendor code.</p>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Activity Log</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Date</th><th>Invoice No</th><th>PO No</th><th>Stage</th></tr>
            </thead>
            <tbody>
              {activityRows.length ? activityRows.map(({ inv, stage }) => (
                <tr key={`${inv.no}-${stage}`}>
                  <td>{inv.date}</td>
                  <td><button type="button" className="link-hero" onClick={() => dispatch(openModal({ kind: 'supplierInvoiceDetail', ctx: { no: inv.no } }))}>{inv.no}</button></td>
                  <td>{inv.po}</td>
                  <td>{stage}</td>
                </tr>
              )) : <tr><td colSpan={4} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No activity yet on {code}.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Closed Invoices</h3>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Invoice No</th><th>Portal</th><th>PO No</th><th>Amount</th><th>Status</th><th>UTR No</th><th>Date</th></tr></thead>
            <tbody>
              {done.length ? done.map((inv, rowIndex) => (
                <tr key={`${inv.no}-${rowIndex}`}>
                  <td><button type="button" className="link-hero" onClick={() => dispatch(openModal({ kind: 'supplierInvoiceDetail', ctx: { no: inv.no } }))}>{inv.no}</button></td>
                  <td>{CHANNEL_LABEL[inv.channel]}</td><td>{inv.po}</td><td>{inv.amount}</td>
                  <td><span className={`chip ${inv.status === 'Paid' ? 'green' : 'amber'}`}>{inv.status}</span></td>
                  <td>{inv.utr === '-' ? <span style={{ color: '#CBD5E1' }}>Not yet visible</span> : inv.utr}</td>
                  <td>{inv.date}</td>
                </tr>
              )) : <tr><td colSpan={7} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>Nothing closed out yet on {code}.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
