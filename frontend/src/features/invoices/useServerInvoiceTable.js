import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { setTablePage } from '../ui/uiSlice';
import { exportInvoices, useGetInvoicePageQuery } from '../../api/invoicesQueryApi';
import { PAGE_SIZE } from '../../components/invoices/InvoiceTable.jsx';

/** An InvoiceTable list paged on the server: pass `invoices` and `server` to <InvoiceTable>.
 *  `filters` are the server's query parameters, plus the table's own search box; a change of either
 *  goes back to the first page. `query` is the full set, for totals that must match the list. */
export default function useServerInvoiceTable({ tableKey, filters: pageFilters, skip = false }) {
  const dispatch = useDispatch();
  const store = useStore();
  const typed = useDeferredValue(useSelector((s) => s.ui.search[tableKey] || ''));
  const filters = useMemo(() => ({ ...pageFilters, q: typed.trim() ? typed : undefined }), [pageFilters, typed]);
  const page = useSelector((s) => s.ui.tablePage[tableKey] || 1);
  const filterKey = JSON.stringify(filters);
  const lastFilterKey = useRef(filterKey);
  useEffect(() => {
    if (lastFilterKey.current === filterKey) return;
    lastFilterKey.current = filterKey;
    dispatch(setTablePage({ key: tableKey, page: 1 }));
  }, [dispatch, tableKey, filterKey]);

  const [sort, setSort] = useState({ key: null, dir: null });
  const sortParam = sort.key ? `${sort.key}:${sort.dir}` : undefined;
  const result = useGetInvoicePageQuery({ ...filters, sort: sortParam, page, page_size: PAGE_SIZE }, { skip });
  const total = result.data?.total ?? 0;
  const server = useMemo(() => ({
    total,
    sort,
    onSort: (key) => setSort((cur) => ({ key, dir: cur.key === key && cur.dir === 'desc' ? 'asc' : 'desc' })),
    onExport: ({ invoiceNumbers, filename }) => exportInvoices({ ...filters, sort: sortParam },
      { getState: store.getState, invoiceNumbers, filename }),
  }), [total, sort, filters, sortParam, store]);
  return {
    invoices: result.data?.items || [], server, total, query: filters, isFetching: result.isFetching,
    error: result.isError ? result.error : null, refetch: result.refetch,
  };
}
