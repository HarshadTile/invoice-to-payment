import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import { setChannelViewTab, setPageFilters } from '../../features/ui/uiSlice';
import { useScope } from '../../features/ui/scope';
import { facetOptionsFromCounts, matchesSrmWorkspace, srmHistoryRows } from '../../utils/srmWorkspace';
import InvoiceFilterBar from './InvoiceFilterBar.jsx';
import SrmDataTable from './SrmDataTable.jsx';
import GlobalLogsBody from '../common/GlobalLogsBody.jsx';
import Dropdown from '../common/Dropdown.jsx';
import { FileText, History, Search, Sliders } from '../common/icons.jsx';
import { filterInvoiceQuery, INVOICE_SEARCH_PLACEHOLDER } from '../../utils/invoiceQuery';
import useWorkspaceSearch from './useWorkspaceSearch';
import useChannelRegister from './useChannelRegister';

const DEFAULTS = { q: '', plant: '', division: '', productType: '', status: '', date_from: '', date_to: '' };
const REMOVED_FILTERS = ['approver', 'pending_with', 'approved_by', 'miro_status', 'payment_status', 'product_type', 'dv_type'];
// 'Invoice Log' stays the key so saved column choices and paging carry over.
const VIEWS = [{ key: 'Invoice Log', label: 'Invoice Register', Icon: FileText }, { key: 'History', label: 'History', Icon: History }];
const PRODUCT_LABEL = { S: 'Service', M: 'Material' };
const NO_INVOICES = [];


export default function SrmWorkspace({ invoices, canExport }) {
  const dispatch = useDispatch();
  const scope = useScope();
  const [params, setParams] = useSearchParams();
  const saved = useSelector((state) => state.ui.pageFilters.srmWorkspace);
  const [initial] = useState(() => Object.keys(DEFAULTS).some((key) => params.has(key)) ? {} : saved || {});
  const filters = useMemo(() => Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, params.get(key) ?? initial[key] ?? ''])), [params, initial]);
  const chosenView = useSelector((state) => state.ui.channelViewTab.msetuSrm);
  const view = VIEWS.some((entry) => entry.key === chosenView) ? chosenView : VIEWS[0].key;
  // The tab lights up immediately; the (large) table for it renders right after.
  const shownView = useDeferredValue(view);
  useEffect(() => { dispatch(setPageFilters({ key: 'srmWorkspace', filters })); }, [dispatch, filters]);
  useEffect(() => {
    if (!REMOVED_FILTERS.some((key) => params.has(key))) return;
    const next = new URLSearchParams(params);
    for (const key of REMOVED_FILTERS) next.delete(key);
    setParams(next, { replace: true });
  }, [params, setParams]);
  const writeParams = useCallback((changes) => setParams((current) => {
    const next = new URLSearchParams(current);
    for (const key of REMOVED_FILTERS) next.delete(key);
    for (const [key, value] of Object.entries(changes)) next.set(key, value || '');
    return next;
  }, { replace: true }), [setParams]);
  const commitQuery = useCallback((q) => writeParams({ q }), [writeParams]);
  // The register is searched on the server; only History (still in the browser) needs the local index.
  const historyShown = shownView === 'History';
  const search = useWorkspaceSearch(filters.q, commitQuery, historyShown ? invoices : NO_INVOICES);
  const update = (changes) => {
    // The search box saves its own text; never write back a q older than what's being typed.
    const { q: _staleQuery, ...rest } = filters;
    if ('q' in changes) search.setQuery(changes.q);
    writeParams({ ...rest, ...changes });
  };
  // Invoice Register: filtered, counted and paged on the server.
  const serverFilters = useMemo(() => ({
    q: search.deferredQuery.trim() ? search.deferredQuery : undefined,
    plant: filters.plant || undefined, dv_type: filters.division || undefined, product_type: filters.productType || undefined,
    statuses: filters.status ? [filters.status] : undefined,
    date_from: filters.date_from || undefined, date_to: filters.date_to || undefined,
  }), [search.deferredQuery, filters]);
  const register = useChannelRegister({ invoices, channel: 'msetuSrm', namespace: 'srm', view: VIEWS[0].key, filters: serverFilters,
    facetFields: ['plant', 'dv_type', 'product_type'], enabled: !historyShown });
  const facets = useMemo(() => ({
    plant: facetOptionsFromCounts(register.facets.plant, 'All plants'),
    division: facetOptionsFromCounts(register.facets.dv_type, 'All divisions'),
    productType: facetOptionsFromCounts(register.facets.product_type, 'All product types', (value) => PRODUCT_LABEL[value] || value),
  }), [register.facets]);
  // History: the dated milestones of every matching invoice, still built in the browser.
  const historyBase = useMemo(() => (!historyShown ? NO_INVOICES
    : filterInvoiceQuery(invoices, search.deferredQuery).filter((invoice) => matchesSrmWorkspace(invoice, { ...filters, q: '' }, scope.dateField, true))),
  [historyShown, invoices, search.deferredQuery, filters, scope.dateField]);
  const historyList = useMemo(() => historyBase.filter((invoice) => !filters.status || invoice.status === filters.status), [historyBase, filters.status]);

  return <>
    <div className="srm-toolbar">
      <div className="srm-tabs" role="group" aria-label="SRM view">
        {VIEWS.map((entry) => <button type="button" className={`srm-tab${view === entry.key ? ' active' : ''}`} key={entry.key}
          aria-pressed={view === entry.key} onClick={() => dispatch(setChannelViewTab({ key: 'msetuSrm', view: entry.key }))}><entry.Icon size={14} />{entry.label}</button>)}
      </div>
      <div className="srm-quick-filters">
        <span className="srm-quick-filters-label"><Sliders size={12} />Filter</span>
        <Dropdown variant="chip" label="Plant" ariaLabel="Filter by plant code" value={filters.plant} options={facets.plant}
          searchPlaceholder="Search plant code" onChange={(plant) => update({ plant })} />
        <Dropdown variant="chip" label="Division" ariaLabel="Filter by division" value={filters.division} options={facets.division}
          searchPlaceholder="Search division" onChange={(division) => update({ division })} />
        <Dropdown variant="chip" label="Product" ariaLabel="Filter by product type" value={filters.productType} options={facets.productType}
          onChange={(productType) => update({ productType })} />
      </div>
    </div>
    <div className="card" style={{ marginBottom: '0.875rem' }}>
      <label className="srm-search-label">Search SRM invoices
        <span className="srm-search"><Search size={15} />
          <input type="search" className="search-box" value={search.query}
            aria-busy={search.pending} placeholder={INVOICE_SEARCH_PLACEHOLDER} onChange={(event) => search.setQuery(event.target.value)} />
        </span>
      </label>
      <InvoiceFilterBar compact status={filters.status} dateFrom={filters.date_from} dateTo={filters.date_to}
        onStatusChange={(status) => update({ status })} onDateFrom={(date_from) => update({ date_from })}
        onDateTo={(date_to) => update({ date_to })} onAllDates={() => update({ date_from: '', date_to: '' })}
        onClear={() => update(DEFAULTS)}
        statusCountBase={historyShown ? historyBase : register.statusCountBase}
        statusCounts={historyShown ? undefined : register.statusCounts}
        resultCount={historyShown ? historyList.length : register.total}
        rangeLabel={!filters.date_from && !filters.date_to ? 'all dates' : `${filters.date_from || 'earliest'} to ${filters.date_to || 'latest'}`} />
    </div>
    <div className={`srm-view${shownView !== view ? ' is-switching' : ''}`} aria-busy={shownView !== view}>
      {shownView !== view && <p role="status" className="srm-view-loading">Loading {VIEWS.find((entry) => entry.key === view).label.toLowerCase()}…</p>}
      {historyShown
        ? <GlobalLogsBody invoiceList={historyList} getInvoiceRows={srmHistoryRows} strictInvoiceScope
          serverQuery={{ kind: 'srm', filters: register.query }} />
        : <>
          {register.error && <p role="alert" className="cell-muted">Invoices could not be loaded: {register.error.message || 'try again'}.{' '}
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => register.refetch()}>Retry</button></p>}
          <SrmDataTable invoices={register.invoices} view={shownView} canExport={canExport} server={register.server} />
        </>}
    </div>
  </>;
}
