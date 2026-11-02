import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { USE_FASTAPI_INVOICES } from '../../api/invoiceApi';
import { useScope } from '../ui/scope';

/** The top-bar scope (fiscal year, channel, vendor, date type) as invoice query parameters: what
 *  applyScope did in the browser, now sent with every list / dashboard request. */
export function useInvoiceScopeParams() {
  const { fy, channel, vcode, dateField } = useScope();
  // Answered from the bundled invoices (tests, prototype), edits must give the queries a new key.
  const dataVersion = useSelector((s) => s.ui.dataVersion);
  return useMemo(() => ({
    channel: channel || 'all', // a channel-locked login is held to its channel by the server
    vendor_code: vcode || undefined,
    fy: fy || 'all',
    date_type: dateField || 'invoice',
    ...(USE_FASTAPI_INVOICES ? {} : { v: dataVersion }),
  }), [channel, vcode, fy, dateField, dataVersion]);
}

/** Every invoice the login may see, ignoring the top-bar selection (for the top bar's own lists). */
export function useInvoiceAccessParams() {
  const dataVersion = useSelector((s) => s.ui.dataVersion);
  return useMemo(() => ({ channel: 'all', ...(USE_FASTAPI_INVOICES ? {} : { v: dataVersion }) }), [dataVersion]);
}
