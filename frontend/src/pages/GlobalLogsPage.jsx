import { useSelector } from 'react-redux';
import { selectScopedInvoices } from '../features/invoices/selectors';
import GlobalLogsBody from '../components/common/GlobalLogsBody.jsx';

export default function GlobalLogsPage() {
  const invoices = useSelector(selectScopedInvoices);
  return (
    <>
      <h1 className="page-title">Logs / History</h1>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '-8px 0 16px' }}>
        Business-activity audit trail: every stage change and query, across every channel and vendor code. For system/integration pull history, see Sync Log.
      </p>
      <GlobalLogsBody invoiceList={invoices} tableKey="globalLogs" />
    </>
  );
}
