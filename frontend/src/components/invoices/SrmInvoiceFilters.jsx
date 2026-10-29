import { useDispatch, useSelector } from 'react-redux';
import { selectScopedInvoices } from '../../features/invoices/selectors';
import { useScope } from '../../features/ui/scope';
import { setScopeFilter } from '../../features/ui/uiSlice';
import Dropdown from '../common/Dropdown.jsx';
import { INVOICE_DATE_FIELDS } from '../../utils/invoiceDates';

export default function SrmInvoiceFilters() {
  const scope = useScope();
  const dispatch = useDispatch();
  const invoices = useSelector(selectScopedInvoices);
  const authType = useSelector((state) => state.auth.authType);
  const divisions = [...new Set(invoices.map((i) => i.dvType).filter(Boolean))].sort();
  const set = (key) => (value) => dispatch(setScopeFilter({ key, value }));
  return <>
    <div style={{ flex: '1 1 10em', minWidth: 0 }}>
      <Dropdown label="Product type" value={scope.productType} onChange={set('productType')}
        options={[{ value: '', label: 'Product Type' }, { value: 'S', label: 'Service (S)' }, { value: 'M', label: 'Material (M)' }]} />
    </div>
    {authType !== 'supplier' && <div style={{ flex: '1 1 10em', minWidth: 0 }}>
      <Dropdown label="Division" value={scope.division} onChange={set('division')}
        options={[{ value: '', label: 'All divisions' }, ...divisions.map((division) => ({ value: division, label: division }))]} />
    </div>}
    <div style={{ flex: '1 1 10em', minWidth: 0 }}>
      <Dropdown label="Date type" value={scope.dateField} onChange={set('dateField')}
        options={INVOICE_DATE_FIELDS} />
    </div>
  </>;
}
