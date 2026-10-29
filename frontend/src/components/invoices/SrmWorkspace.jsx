import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import { setChannelViewTab, setPageFilters } from '../../features/ui/uiSlice';
import { useScope } from '../../features/ui/scope';
import { matchesSrmWorkspace, srmHistoryRows } from '../../utils/srmWorkspace';
import InvoiceFilterBar from './InvoiceFilterBar.jsx';
import SrmDataTable from './SrmDataTable.jsx';
import Dropdown from '../common/Dropdown.jsx';
import GlobalLogsBody from '../common/GlobalLogsBody.jsx';

const DEFAULTS = { q: '', status: '', date_from: '', date_to: '', approver: '', pending_with: '', approved_by: '', miro_status: '', payment_status: '' };
const VIEWS = ['Invoice Log', 'Approver Assignment', 'SAP Booking (MIRO)', 'Payment & UTR (FBL1N)', 'History'];
const clean = (value) => value == null || String(value).trim() === '-' ? '' : String(value).trim();

export default function SrmWorkspace({ invoices, canExport }) {
  const dispatch = useDispatch();
  const scope = useScope();
  const [params, setParams] = useSearchParams();
  const saved = useSelector((state) => state.ui.pageFilters.srmWorkspace);
  const [initial] = useState(() => Object.keys(DEFAULTS).some((key) => params.has(key)) ? {} : saved || {});
  const filters = useMemo(() => Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, params.get(key) ?? initial[key] ?? ''])), [params, initial]);
  const chosenView = useSelector((state) => state.ui.channelViewTab.msetuSrm);
  const view = VIEWS.includes(chosenView) ? chosenView : VIEWS[0];
  useEffect(() => { dispatch(setPageFilters({ key: 'srmWorkspace', filters })); }, [dispatch, filters]);
  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries({ ...filters, ...changes })) next.set(key, value || '');
    setParams(next, { replace: true });
  };
  const options = useMemo(() => {
    const values = { approver: new Set(), pending_with: new Set(), approved_by: new Set() };
    for (const invoice of invoices) {
      for (let index = 1; index <= 7; index += 1) {
        const value = clean(invoice.workflow?.approvers?.[`approver_${index}`]);
        if (value) values.approver.add(value);
      }
      for (const key of ['pending_with', 'approved_by']) {
        const value = clean(invoice.workflow?.[key]);
        if (value) values[key].add(value);
      }
    }
    return Object.fromEntries(Object.entries(values).map(([key, entries]) => [key,
      [{ value: '', label: key === 'approver' ? 'Any approver' : 'Anyone' }, ...[...entries].sort().map((value) => ({ value, label: value }))],
    ]));
  }, [invoices]);
  const beforeStatus = useMemo(() => invoices.filter((invoice) => matchesSrmWorkspace(invoice, filters, scope.dateField, true)), [invoices, filters, scope.dateField]);
  const filtered = useMemo(() => beforeStatus.filter((invoice) => !filters.status || invoice.status === filters.status), [beforeStatus, filters.status]);

  return <>
    <div className="sheet-carousel" style={{ margin: '0.25rem 0 1rem' }}><div className="car-track">
      {VIEWS.map((entry) => <button type="button" className={`car-chip${view === entry ? ' active' : ''}`} key={entry}
        onClick={() => dispatch(setChannelViewTab({ key: 'msetuSrm', view: entry }))}>{entry}</button>)}
    </div></div>
    <div className="card" style={{ marginBottom: '0.875rem' }}>
      <label className="srm-search-label">Search SRM invoices
        <input type="search" className="search-box" style={{ width: '100%' }} value={filters.q}
          placeholder="Invoice no, PO no, PO item, UTR, PAN or vendor" onChange={(event) => update({ q: event.target.value })} />
      </label>
    </div>
    <InvoiceFilterBar status={filters.status} dateFrom={filters.date_from} dateTo={filters.date_to}
      onStatusChange={(status) => update({ status })} onDateFrom={(date_from) => update({ date_from })}
      onDateTo={(date_to) => update({ date_to })} onAllDates={() => update({ date_from: '', date_to: '' })}
      onClear={() => update(DEFAULTS)} statusCountBase={beforeStatus} resultCount={filtered.length}
      rangeLabel={!filters.date_from && !filters.date_to ? 'all dates' : `${filters.date_from || 'earliest'} to ${filters.date_to || 'latest'}`} />
    <div className="card srm-advanced-filters" style={{ marginBottom: '0.875rem' }}>
      {[
        ['approver', 'Approver', options.approver], ['pending_with', 'Pending With', options.pending_with],
        ['approved_by', 'Approved By', options.approved_by],
        ['miro_status', 'MIRO Status', [{ value: '', label: 'Any MIRO status' }, { value: 'booked', label: 'Booked' }, { value: 'pending', label: 'Pending for MIRO' }]],
        ['payment_status', 'Payment Status', [{ value: '', label: 'Any payment status' }, { value: 'paid', label: 'Paid' }, { value: 'unpaid', label: 'Unpaid' }]],
      ].map(([key, label, entries]) => <Dropdown key={key} label={label} value={filters[key]} options={entries}
        searchPlaceholder={['approver', 'pending_with', 'approved_by'].includes(key) ? `Search ${label.toLowerCase()}` : undefined}
        onChange={(value) => update({ [key]: value })} />)}
    </div>
    {view === 'History' ? <GlobalLogsBody invoiceList={filtered} getInvoiceRows={srmHistoryRows} strictInvoiceScope />
      : <SrmDataTable invoices={filtered} view={view} canExport={canExport} />}
  </>;
}
