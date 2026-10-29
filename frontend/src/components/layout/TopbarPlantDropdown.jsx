import { useSelector } from 'react-redux';
import { selectScopedInvoices } from '../../features/invoices/selectors';
import Dropdown from '../common/Dropdown.jsx';

export default function TopbarPlantDropdown({ scope, onUpdate }) {
  const invoices = useSelector(selectScopedInvoices);
  const plants = [...new Set(invoices.map((invoice) => invoice.plant).filter(Boolean))].sort();
  return (
    <div className="topbar-plant-filter">
      <Dropdown ariaLabel="Filter by plant code" value={scope.plant}
        searchPlaceholder="Search plant code"
        onChange={(value) => onUpdate('plant', value)}
        options={[{ value: '', label: 'Plant Code' }, ...plants.map((plant) => ({ value: plant, label: plant }))]} />
    </div>
  );
}
