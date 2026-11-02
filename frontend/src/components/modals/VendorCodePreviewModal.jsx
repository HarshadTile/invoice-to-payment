import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useGetInvoiceFacetsQuery, useGetInvoiceVendorsQuery } from '../../api/invoicesQueryApi';
import { useInvoiceAccessParams } from '../../features/invoices/useInvoiceScopeParams';
import { closeModal } from '../../features/ui/uiSlice';
import { selectHasTicketAccess, selectPerm } from '../../features/auth/authSlice';
import { useGetTicketsQuery } from '../../api/ticketsApi';
import ModalShell from './ModalShell.jsx';

export default function VendorCodePreviewModal({ ctx }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { authType } = useSelector((s) => s.auth);
  // The full page is Supplier Visibility, which needs its own permission.
  const canOpenFull = useSelector((s) => s.auth.authType === 'supplier' || !!selectPerm(s).viewSupplierVisibility);
  const code = ctx.code;
  // Name, PAN and counts for this one code, across everything the login may see.
  const access = useInvoiceAccessParams();
  const vendorMatches = useGetInvoiceVendorsQuery({ ...access, vendor_q: code, limit: 20 });
  const vendor = vendorMatches.data?.find((v) => v.code === code);
  const poFacet = useGetInvoiceFacetsQuery({ ...access, vendor_code: code, fields: ['po'] });
  const poCount = Object.keys(poFacet.data?.po || {}).filter((po) => po && po !== '-').length;
  const loading = vendorMatches.isLoading || poFacet.isLoading;
  const shown = (value) => (loading ? '…' : value);
  const hasTicketAccess = useSelector(selectHasTicketAccess);
  const { data: ticketPage } = useGetTicketsQuery({ vendor_code: code, page_size: 100 }, { skip: !hasTicketAccess });
  const openIssues = (ticketPage?.items || []).filter((t) => ['OPEN', 'IN_PROGRESS'].includes(t.status)).length;

  return (
    <ModalShell
      title={code}
      width={420}
      foot={(
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          {canOpenFull ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                dispatch(closeModal());
                navigate(authType === 'supplier' ? `/supplier/vendor-code/${code}` : `/app/vendor-code/${code}`);
              }}
            >
              Open Full View →
            </button>
          ) : <span />}
          <button type="button" className="btn" onClick={() => dispatch(closeModal())}>Close</button>
        </div>
      )}
    >
      <div className="validation-row"><span>Supplier</span><span style={{ fontWeight: 700 }}>{shown(vendor?.name || '-')}</span></div>
      <div className="validation-row"><span>PAN</span><span>{shown(vendor?.pan || '-')}</span></div>
      <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', display: 'block', margin: '0.875rem 0 0.5rem' }}>On This Vendor Code</label>
      <div className="validation-row"><span>Total Invoices</span><span>{shown(vendor?.count ?? 0)}</span></div>
      <div className="validation-row"><span>Purchase Orders</span><span>{shown(poCount)}</span></div>
      <div className="validation-row"><span>Open Queries</span><span>{openIssues}</span></div>
    </ModalShell>
  );
}
