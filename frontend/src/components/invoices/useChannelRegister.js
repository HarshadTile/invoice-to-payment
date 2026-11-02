import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { setTablePage } from '../../features/ui/uiSlice';
import { USE_FASTAPI_INVOICES } from '../../api/invoiceApi';
import {
  facetsOfList, fetchAllMatching, filterLocalInvoices, useGetInvoiceFacetsQuery, useGetInvoicePageQuery,
} from '../../api/invoicesQueryApi';
import { useInvoiceScopeParams } from '../../features/invoices/useInvoiceScopeParams';
import { PAGE_SIZE, pageKeyFor } from './SrmDataTable.jsx';

/*
 * One channel's invoice register (SRM / PO Portal). `filters` uses the server's parameter names; the
 * top-bar year / vendor / date type apply, the channel is the page's own. Returns what the workspace
 * shows: `invoices` and `server` for SrmDataTable, `statusCounts` (or `statusCountBase`) for the filter
 * bar, `total`, and `facets` (value -> count over the whole channel) for the dropdowns.
 *
 * On the live API the register is filtered, counted and paged on the server. Otherwise (tests, the
 * offline prototype) every invoice is in memory: the same rules run at once in the browser and the
 * table pages, sorts and exports the full list itself. The choice is made once per build.
 */

function useChannelRegisterFromServer({ channel, namespace, view, filters, facetFields, enabled = true }) {
  const dispatch = useDispatch();
  const store = useStore();
  const scopeParams = useInvoiceScopeParams();
  const base = useMemo(() => ({ ...scopeParams, channel }), [scopeParams, channel]);
  const query = useMemo(() => ({ ...base, ...filters }), [base, filters]);

  // A new filter starts the register on its first page.
  const pageKey = pageKeyFor(namespace, view);
  const page = useSelector((state) => state.ui.tablePage[pageKey] || 1);
  const queryKey = JSON.stringify(query);
  const lastQueryKey = useRef(queryKey);
  useEffect(() => {
    if (lastQueryKey.current === queryKey) return;
    lastQueryKey.current = queryKey;
    dispatch(setTablePage({ key: pageKey, page: 1 }));
  }, [dispatch, pageKey, queryKey]);

  const [sort, setSort] = useState();
  const skip = !enabled;
  const result = useGetInvoicePageQuery({ ...query, sort, page, page_size: PAGE_SIZE }, { skip });
  const statusFacet = useGetInvoiceFacetsQuery({ ...query, fields: ['status'] }, { skip });
  // Dropdown values cover the whole channel, whichever tab is showing.
  const channelFacets = useGetInvoiceFacetsQuery({ ...base, fields: facetFields });

  const fetchAll = useCallback(() => fetchAllMatching({ ...query, sort }, { getState: store.getState }), [query, sort, store]);
  const total = result.data?.total ?? 0;
  const server = useMemo(() => ({ total, onSort: setSort, fetchAll }), [total, fetchAll]);
  return {
    invoices: result.data?.items || [],
    server,
    total,
    query, // the register's filters, for the History log built on the server
    statusCounts: statusFacet.data?.status || {},
    facets: channelFacets.data || {},
    isFetching: result.isFetching,
    error: result.isError ? result.error : null,
    refetch: result.refetch,
  };
}

function useChannelRegisterInMemory({ invoices: channelList, filters, facetFields }) {
  // `invoices`: the channel's invoices, already narrowed to the top-bar scope by the Channel page.
  const internal = useSelector((state) => state.auth.authType !== 'supplier');
  const dateType = useInvoiceScopeParams().date_type;
  const { statuses, ...rest } = filters;
  const beforeStatus = useMemo(() => filterLocalInvoices(channelList, { date_type: dateType, ...rest }, internal),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channelList, dateType, JSON.stringify(rest), internal]);
  const invoices = useMemo(() => (statuses?.length ? beforeStatus.filter((inv) => statuses.includes(inv.status)) : beforeStatus),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [beforeStatus, JSON.stringify(statuses)]);
  const facets = useMemo(() => facetsOfList(channelList, { fields: facetFields }, internal),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channelList, facetFields.join(), internal]);
  return { invoices, server: undefined, total: invoices.length, statusCountBase: beforeStatus, facets,
    isFetching: false, error: null, refetch: () => {} };
}

const useChannelRegister = USE_FASTAPI_INVOICES ? useChannelRegisterFromServer : useChannelRegisterInMemory;
export default useChannelRegister;
