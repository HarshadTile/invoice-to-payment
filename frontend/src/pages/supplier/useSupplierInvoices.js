import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useScope } from '../../features/ui/scope';
import { invoiceFiscalYear, selectScopedInvoices } from '../../features/invoices/selectors';

/**
 * The supplier's own invoices: their vendor codes (or the one picked in the top bar) and the
 * top-bar financial year. The Dashboard and My Invoices both start from this list, so they agree.
 */
export default function useSupplierInvoices() {
  const invoices = useSelector(selectScopedInvoices);
  const { supplierLoginVcode, supplierVendorCodes } = useSelector((s) => s.auth);
  const { fy, vcode } = useScope();
  const allowedCodes = useMemo(
    () => (supplierVendorCodes.length ? supplierVendorCodes : (supplierLoginVcode ? [supplierLoginVcode] : [])),
    [supplierVendorCodes, supplierLoginVcode],
  );
  const selectedCode = allowedCodes.includes(vcode) ? vcode : 'all';
  return useMemo(() => invoices.filter((i) => {
    if (selectedCode === 'all' ? !allowedCodes.includes(i.vcode) : i.vcode !== selectedCode) return false;
    return fy === 'all' || invoiceFiscalYear(i) === fy;
  }), [invoices, allowedCodes, selectedCode, fy]);
}
