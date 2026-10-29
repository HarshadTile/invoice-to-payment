import { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setChannelViewTab, setPageFilters } from '../../features/ui/uiSlice';
import { useScope } from '../../features/ui/scope';
import { PO_TABLE_CONFIG, PO_VIEWS, matchesPoPortalWorkspace, poPortalHistoryRows } from '../../utils/poPortalWorkspace';
import InvoiceFilterBar from './InvoiceFilterBar.jsx';
import SrmDataTable from './SrmDataTable.jsx';
import Dropdown from '../common/Dropdown.jsx';
import GlobalLogsBody from '../common/GlobalLogsBody.jsx';

const EMPTY = { q: '', status: '', date_from: '', date_to: '', hod1_status: '', hod2_status: '', accounts_status: '',
  source_approval_stage: '', invoice_uploaded: '', miro_status: '', payment_status: '', po_type: '', approver: '' };
const choices = (label, values) => [{ value: '', label }, ...values.map((value) => ({ value, label: value === '__blank__' ? 'Not recorded' : value }))];
const APPROVAL = choices('Any status', ['APPROVED', 'REJECTED', '__blank__']);

export default function PoPortalWorkspace({ invoices, canExport }) {
  const dispatch = useDispatch();
  const scope = useScope();
  const filters = useSelector((s) => s.ui.pageFilters.poPortalWorkspace) || EMPTY;
  const chosenView = useSelector((s) => s.ui.channelViewTab.poPortal);
  const view = PO_VIEWS.includes(chosenView) ? chosenView : PO_VIEWS[0];
  const update = (changes) => dispatch(setPageFilters({ key: 'poPortalWorkspace', filters: { ...filters, ...changes } }));
  const beforeStatus = useMemo(() => invoices.filter((i) => matchesPoPortalWorkspace(i, filters, scope.dateField, true)), [invoices, filters, scope.dateField]);
  const filtered = useMemo(() => beforeStatus.filter((i) => !filters.status || i.status === filters.status), [beforeStatus, filters.status]);
  const approvers = [...new Set(invoices.flatMap((i) => [i.poPortal?.hod1, i.poPortal?.hod2, i.poPortal?.accounts_user]).filter(Boolean))].sort();
  const poTypes = [...new Set(invoices.map((i) => i.poPortal?.po_type).filter(Boolean))].sort();
  return <>
    <div className="sheet-carousel" style={{ margin: '0.25rem 0 1rem' }}><div className="car-track">
      {PO_VIEWS.map((entry) => <button type="button" className={`car-chip${view === entry ? ' active' : ''}`} key={entry}
        onClick={() => dispatch(setChannelViewTab({ key: 'poPortal', view: entry }))}>{entry}</button>)}
    </div></div>
    <div className="card" style={{ marginBottom: '0.875rem' }}>
      <label className="srm-search-label">Search PO Portal invoices
        <input type="search" className="search-box" style={{ width: '100%' }} value={filters.q}
          placeholder="Invoice no, PO no, PO item, UTR, PAN or vendor" onChange={(e) => update({ q: e.target.value })} />
      </label>
    </div>
    <InvoiceFilterBar status={filters.status} dateFrom={filters.date_from} dateTo={filters.date_to}
      onStatusChange={(status) => update({ status })} onDateFrom={(date_from) => update({ date_from })}
      onDateTo={(date_to) => update({ date_to })} onAllDates={() => update({ date_from: '', date_to: '' })}
      onClear={() => update(EMPTY)} statusCountBase={beforeStatus} resultCount={filtered.length}
      rangeLabel={!filters.date_from && !filters.date_to ? 'all dates' : `${filters.date_from || 'earliest'} to ${filters.date_to || 'latest'}`} />
    <div className="card srm-advanced-filters" style={{ marginBottom: '0.875rem' }}>
      {[
        ['hod1_status', 'HOD1 Status', APPROVAL], ['hod2_status', 'HOD2 Status', APPROVAL], ['accounts_status', 'Accounts Status', APPROVAL],
        ['source_approval_stage', 'Source Approval Stage', choices('Any stage', ['SC', 'INFO', 'HOD1', 'HOD2'])],
        ['approver', 'Approver', choices('Any approver', approvers)], ['po_type', 'PO Type', choices('Any PO type', poTypes)],
        ['invoice_uploaded', 'Invoice Uploaded', [{ value: '', label: 'Any upload status' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]],
        ['miro_status', 'MIRO Status', [{ value: '', label: 'Any MIRO status' }, { value: 'booked', label: 'Booked' }, { value: 'pending', label: 'Pending for MIRO' }]],
        ['payment_status', 'Payment Status', [{ value: '', label: 'Any payment status' }, { value: 'paid', label: 'Paid' }, { value: 'unpaid', label: 'Unpaid' }]],
      ].map(([key, label, options]) => <Dropdown key={key} label={label} value={filters[key]} options={options}
        searchPlaceholder={key === 'approver' ? 'Search approver' : undefined} onChange={(value) => update({ [key]: value })} />)}
    </div>
    {view === 'History' ? <GlobalLogsBody invoiceList={filtered} getInvoiceRows={poPortalHistoryRows} strictInvoiceScope />
      : <SrmDataTable invoices={filtered} view={view} canExport={canExport} config={PO_TABLE_CONFIG} />}
  </>;
}
