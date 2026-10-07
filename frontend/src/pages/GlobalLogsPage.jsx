import { useSelector } from 'react-redux';
import { selectFilteredInvoices } from '../features/invoices/selectors';
import GlobalLogsBody from '../components/common/GlobalLogsBody.jsx';

export default function GlobalLogsPage() {
  const invoices = useSelector(selectFilteredInvoices);
  return <GlobalLogsBody invoiceList={invoices} />;
}
