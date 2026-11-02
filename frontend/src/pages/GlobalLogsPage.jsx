import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { selectFilteredInvoices } from '../features/invoices/selectors';
import { useInvoiceScopeParams } from '../features/invoices/useInvoiceScopeParams';
import GlobalLogsBody from '../components/common/GlobalLogsBody.jsx';

export default function GlobalLogsPage() {
  const invoices = useSelector(selectFilteredInvoices); // the offline log only; the live one is built on the server
  const scopeParams = useInvoiceScopeParams();
  const serverQuery = useMemo(() => ({ kind: 'global', filters: scopeParams }), [scopeParams]);
  return <GlobalLogsBody invoiceList={invoices} serverQuery={serverQuery} />;
}
