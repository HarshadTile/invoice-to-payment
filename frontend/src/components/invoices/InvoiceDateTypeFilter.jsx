import { useDispatch } from 'react-redux';
import { useScope } from '../../features/ui/scope';
import { setScopeFilter } from '../../features/ui/uiSlice';
import { INVOICE_DATE_FIELDS } from '../../utils/invoiceDates';
import Dropdown from '../common/Dropdown.jsx';

export default function InvoiceDateTypeFilter({ variant }) {
  const scope = useScope();
  const dispatch = useDispatch();
  if (variant === 'chip') {
    return <Dropdown variant="chip" label="Date" ariaLabel="Date type" value={scope.dateField}
      onChange={(value) => dispatch(setScopeFilter({ key: 'dateField', value }))} options={INVOICE_DATE_FIELDS} />;
  }
  return <div style={{ flex: '1 1 10em', minWidth: 0 }}>
    <Dropdown label="Date type" value={scope.dateField}
      onChange={(value) => dispatch(setScopeFilter({ key: 'dateField', value }))}
      options={INVOICE_DATE_FIELDS} />
  </div>;
}
