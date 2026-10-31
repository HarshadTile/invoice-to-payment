import { useCallback, useDeferredValue, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setChannelViewTab, setPageFilters } from '../../features/ui/uiSlice';
import { useScope } from '../../features/ui/scope';
import { PO_TABLE_CONFIG, PO_VIEWS, matchesPoPortalWorkspace, poPortalHistoryRows } from '../../utils/poPortalWorkspace';
import { facetOptions } from '../../utils/srmWorkspace';
import InvoiceFilterBar from './InvoiceFilterBar.jsx';
import SrmDataTable from './SrmDataTable.jsx';
import Dropdown from '../common/Dropdown.jsx';
import GlobalLogsBody from '../common/GlobalLogsBody.jsx';
import { FileText, History, Search, Sliders } from '../common/icons.jsx';
import { filterInvoiceQuery, INVOICE_SEARCH_PLACEHOLDER } from '../../utils/invoiceQuery';
import useWorkspaceSearch from './useWorkspaceSearch';

// Same shape as SRM: master search + status/date, and three PO-specific quick filters.
// Approval statuses, MIRO and payment state are found through the master search instead.
const EMPTY = { q: '', status: '', date_from: '', date_to: '', source_approval_stage: '', po_type: '', approver: '' };
const VIEW_ICON = { 'Invoice Log': FileText, History };

export default function PoPortalWorkspace({ invoices, canExport }) {
  const dispatch = useDispatch();
  const scope = useScope();
  const saved = useSelector((s) => s.ui.pageFilters.poPortalWorkspace);
  // Only the current filter keys: older saved filters (HOD statuses, MIRO, ...) must not narrow silently.
  const filters = useMemo(() => Object.fromEntries(Object.keys(EMPTY).map((key) => [key, saved?.[key] ?? ''])), [saved]);
  const chosenView = useSelector((s) => s.ui.channelViewTab.poPortal);
  const view = PO_VIEWS.some((entry) => entry.key === chosenView) ? chosenView : PO_VIEWS[0].key;
  // The tab lights up immediately; the (large) table for it renders right after.
  const shownView = useDeferredValue(view);
  const commitQuery = useCallback((q) => dispatch(setPageFilters({ key: 'poPortalWorkspace', filters: { ...filters, q } })), [dispatch, filters]);
  const search = useWorkspaceSearch(filters.q, commitQuery, invoices);
  const update = (changes) => {
    if ('q' in changes) search.setQuery(changes.q);
    dispatch(setPageFilters({ key: 'poPortalWorkspace', filters: { ...filters, ...changes } }));
  };
  // Search first through the list's cached index, then the cheap field filters.
  const searched = useMemo(() => filterInvoiceQuery(invoices, search.deferredQuery), [invoices, search.deferredQuery]);
  const beforeStatus = useMemo(() => searched.filter((i) => matchesPoPortalWorkspace(i, { ...filters, q: '' }, scope.dateField, true)), [searched, filters, scope.dateField]);
  const filtered = useMemo(() => beforeStatus.filter((i) => !filters.status || i.status === filters.status), [beforeStatus, filters.status]);
  const facets = useMemo(() => ({
    stage: facetOptions(invoices, (i) => i.poPortal?.source_approval_stage, 'All stages'),
    poType: facetOptions(invoices, (i) => i.poPortal?.po_type, 'All PO types'),
    approver: facetOptions(invoices, (i) => [i.poPortal?.hod1, i.poPortal?.hod2, i.poPortal?.accounts_user], 'All approvers'),
  }), [invoices]);

  return <>
    <div className="srm-toolbar">
      <div className="srm-tabs" role="group" aria-label="PO Portal view">
        {PO_VIEWS.map((entry) => {
          const Icon = VIEW_ICON[entry.key];
          return <button type="button" className={`srm-tab${view === entry.key ? ' active' : ''}`} key={entry.key}
            aria-pressed={view === entry.key} onClick={() => dispatch(setChannelViewTab({ key: 'poPortal', view: entry.key }))}><Icon size={14} />{entry.label}</button>;
        })}
      </div>
      <div className="srm-quick-filters">
        <span className="srm-quick-filters-label"><Sliders size={12} />Filter</span>
        <Dropdown variant="chip" label="Stage" ariaLabel="Filter by source approval stage" value={filters.source_approval_stage}
          options={facets.stage} onChange={(source_approval_stage) => update({ source_approval_stage })} />
        <Dropdown variant="chip" label="PO Type" ariaLabel="Filter by PO type" value={filters.po_type} options={facets.poType}
          searchPlaceholder="Search PO type" onChange={(po_type) => update({ po_type })} />
        <Dropdown variant="chip" label="Approver" ariaLabel="Filter by approver" value={filters.approver} options={facets.approver}
          searchPlaceholder="Search approver" onChange={(approver) => update({ approver })} />
      </div>
    </div>
    <div className="card" style={{ marginBottom: '0.875rem' }}>
      <label className="srm-search-label">Search PO Portal invoices
        <span className="srm-search"><Search size={15} />
          <input type="search" className="search-box" value={search.query}
            aria-busy={search.pending} placeholder={INVOICE_SEARCH_PLACEHOLDER} onChange={(e) => search.setQuery(e.target.value)} />
        </span>
      </label>
      <InvoiceFilterBar compact status={filters.status} dateFrom={filters.date_from} dateTo={filters.date_to}
        onStatusChange={(status) => update({ status })} onDateFrom={(date_from) => update({ date_from })}
        onDateTo={(date_to) => update({ date_to })} onAllDates={() => update({ date_from: '', date_to: '' })}
        onClear={() => update(EMPTY)} statusCountBase={beforeStatus} resultCount={filtered.length}
        rangeLabel={!filters.date_from && !filters.date_to ? 'all dates' : `${filters.date_from || 'earliest'} to ${filters.date_to || 'latest'}`} />
    </div>
    <div className={`srm-view${shownView !== view ? ' is-switching' : ''}`} aria-busy={shownView !== view}>
      {shownView !== view && <p role="status" className="srm-view-loading">Loading {PO_VIEWS.find((entry) => entry.key === view).label.toLowerCase()}…</p>}
      {shownView === 'History' ? <GlobalLogsBody invoiceList={filtered} getInvoiceRows={poPortalHistoryRows} strictInvoiceScope />
        : <SrmDataTable invoices={filtered} view={shownView} canExport={canExport} config={PO_TABLE_CONFIG} />}
    </div>
  </>;
}
