import { useCallback, useDeferredValue, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setChannelViewTab, setPageFilters } from '../../features/ui/uiSlice';
import { useScope } from '../../features/ui/scope';
import { PO_TABLE_CONFIG, PO_VIEWS, matchesPoPortalWorkspace, poPortalHistoryRows } from '../../utils/poPortalWorkspace';
import { facetOptionsFromCounts } from '../../utils/srmWorkspace';
import InvoiceFilterBar from './InvoiceFilterBar.jsx';
import SrmDataTable from './SrmDataTable.jsx';
import Dropdown from '../common/Dropdown.jsx';
import GlobalLogsBody from '../common/GlobalLogsBody.jsx';
import { FileText, History, Search, Sliders } from '../common/icons.jsx';
import { filterInvoiceQuery, INVOICE_SEARCH_PLACEHOLDER } from '../../utils/invoiceQuery';
import useWorkspaceSearch from './useWorkspaceSearch';
import useChannelRegister from './useChannelRegister';

// Same shape as SRM: master search + status/date, and three PO-specific quick filters.
// Approval statuses, MIRO and payment state are found through the master search instead.
const EMPTY = { q: '', status: '', date_from: '', date_to: '', source_approval_stage: '', po_type: '', approver: '' };
const VIEW_ICON = { 'Invoice Log': FileText, History };
const NO_INVOICES = [];

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
  // The register is searched on the server; only History (still in the browser) needs the local index.
  const historyShown = shownView === 'History';
  const search = useWorkspaceSearch(filters.q, commitQuery, historyShown ? invoices : NO_INVOICES);
  const update = (changes) => {
    if ('q' in changes) search.setQuery(changes.q);
    dispatch(setPageFilters({ key: 'poPortalWorkspace', filters: { ...filters, ...changes } }));
  };
  // Invoice Register: filtered, counted and paged on the server.
  const serverFilters = useMemo(() => ({
    q: search.deferredQuery.trim() ? search.deferredQuery : undefined,
    po_stage: filters.source_approval_stage || undefined, po_type: filters.po_type || undefined,
    approver: filters.approver || undefined, statuses: filters.status ? [filters.status] : undefined,
    date_from: filters.date_from || undefined, date_to: filters.date_to || undefined,
  }), [search.deferredQuery, filters]);
  const register = useChannelRegister({ invoices, channel: 'poPortal', namespace: PO_TABLE_CONFIG.namespace, view: PO_VIEWS[0].key,
    filters: serverFilters, facetFields: ['source_approval_stage', 'po_type', 'po_approver'], enabled: !historyShown });
  const facets = useMemo(() => ({
    stage: facetOptionsFromCounts(register.facets.source_approval_stage, 'All stages'),
    poType: facetOptionsFromCounts(register.facets.po_type, 'All PO types'),
    approver: facetOptionsFromCounts(register.facets.po_approver, 'All approvers'),
  }), [register.facets]);
  // History: the dated milestones of every matching invoice, still built in the browser.
  const historyBase = useMemo(() => (!historyShown ? NO_INVOICES
    : filterInvoiceQuery(invoices, search.deferredQuery).filter((i) => matchesPoPortalWorkspace(i, { ...filters, q: '' }, scope.dateField, true))),
  [historyShown, invoices, search.deferredQuery, filters, scope.dateField]);
  const historyList = useMemo(() => historyBase.filter((i) => !filters.status || i.status === filters.status), [historyBase, filters.status]);

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
        onClear={() => update(EMPTY)}
        statusCountBase={historyShown ? historyBase : register.statusCountBase}
        statusCounts={historyShown ? undefined : register.statusCounts}
        resultCount={historyShown ? historyList.length : register.total}
        rangeLabel={!filters.date_from && !filters.date_to ? 'all dates' : `${filters.date_from || 'earliest'} to ${filters.date_to || 'latest'}`} />
    </div>
    <div className={`srm-view${shownView !== view ? ' is-switching' : ''}`} aria-busy={shownView !== view}>
      {shownView !== view && <p role="status" className="srm-view-loading">Loading {PO_VIEWS.find((entry) => entry.key === view).label.toLowerCase()}…</p>}
      {historyShown
        ? <GlobalLogsBody invoiceList={historyList} getInvoiceRows={poPortalHistoryRows} strictInvoiceScope
          serverQuery={{ kind: 'po', filters: register.query }} />
        : <>
          {register.error && <p role="alert" className="cell-muted">Invoices could not be loaded: {register.error.message || 'try again'}.{' '}
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => register.refetch()}>Retry</button></p>}
          <SrmDataTable invoices={register.invoices} view={shownView} canExport={canExport} config={PO_TABLE_CONFIG} server={register.server} />
        </>}
    </div>
  </>;
}
