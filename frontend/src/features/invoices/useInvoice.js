import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { USE_FASTAPI_INVOICES } from '../../api/invoiceApi';
import { useGetInvoicePageQuery, useGetInvoiceQuery } from '../../api/invoicesQueryApi';
import { findInvoice } from './invoice';
import { selectScopedInvoices } from './selectors';

/* One invoice by the identity a list row passes when it opens it ({ no, poItem, channel, sourceId,
 * vcode, po }). On the live API it is fetched from the server; otherwise (tests, the offline
 * prototype) every invoice is already in memory and is found there at once, as before. The choice is
 * made once per build, so each component always calls the same hooks. */

function useInvoiceFromServer(ctx = {}) {
  const { data, isLoading, isError, error, refetch } = useGetInvoiceQuery({
    no: ctx.no, poItem: ctx.poItem, channel: ctx.channel, sourceId: ctx.sourceId, vcode: ctx.vcode, po: ctx.po,
  }, { skip: !ctx.no });
  return { inv: data || null, isLoading, isError, error, refetch };
}

function useInvoiceInMemory(ctx = {}) {
  const invoices = useSelector(selectScopedInvoices); // re-read when invoice data changes
  const inv = findInvoice(ctx.no, ctx.poItem, invoices, ctx) || null;
  return { inv, isLoading: false, isError: false, error: null, refetch: () => {} };
}

export const useInvoice = USE_FASTAPI_INVOICES ? useInvoiceFromServer : useInvoiceInMemory;

/** The other invoices on purchase order `po` (excluding `inv` itself) that the login may see. */
function useOtherInvoicesOnPoFromServer(inv) {
  const po = inv?.po;
  const { data } = useGetInvoicePageQuery({ channel: 'all', po_number: po, page_size: 50 }, { skip: !po || po === '-' });
  return useMemo(() => (data?.items || []).filter((i) => i.po === po && !(i.no === inv.no && i.poItem === inv.poItem)),
    [data, po, inv]);
}

function useOtherInvoicesOnPoInMemory(inv) {
  const invoices = useSelector(selectScopedInvoices);
  return useMemo(() => (inv ? invoices.filter((i) => i.po === inv.po && !(i.no === inv.no && i.poItem === inv.poItem)) : []),
    [invoices, inv]);
}

export const useOtherInvoicesOnPo = USE_FASTAPI_INVOICES ? useOtherInvoicesOnPoFromServer : useOtherInvoicesOnPoInMemory;
