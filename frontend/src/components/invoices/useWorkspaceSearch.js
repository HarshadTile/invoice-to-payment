import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { warmInvoiceSearch } from '../../utils/invoiceQuery';

/** Typing stays instant on large lists: the box keeps its own text, filtering runs on a
 *  deferred copy, and the saved filter (URL / Redux) is written once that copy settles. */
export default function useWorkspaceSearch(saved, commit, invoices) {
  const [query, setQuery] = useState(saved);
  const deferredQuery = useDeferredValue(query);
  const committed = useRef(saved);
  // Outside changes (Clear, back/forward) replace the typed text.
  useEffect(() => {
    if (saved === committed.current) return;
    committed.current = saved;
    setQuery(saved);
  }, [saved]);
  useEffect(() => {
    if (deferredQuery === committed.current) return;
    committed.current = deferredQuery;
    commit(deferredQuery);
  }, [deferredQuery, commit]);
  useEffect(() => warmInvoiceSearch(invoices), [invoices]);
  return { query, setQuery, deferredQuery, pending: query !== deferredQuery };
}
