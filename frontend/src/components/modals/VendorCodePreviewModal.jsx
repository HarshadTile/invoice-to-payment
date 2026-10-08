import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { supplierForVendorCode, panFor, supplierEmailFor, synthPhone, posForVendorCode, ticketInvoice } from '../../utils/businessLogic';
import { runtime } from '../../data/runtime';
import { closeModal } from '../../features/ui/uiSlice';
import ModalShell from './ModalShell.jsx';

export default function VendorCodePreviewModal({ ctx }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { authType } = useSelector((s) => s.auth);
  const code = ctx.code;
  const supplier = supplierForVendorCode(code);
  const invoices = runtime.invoices.filter((i) => i.vcode === code);
  const poCount = Object.keys(posForVendorCode(code)).length;
  const ticketItems = useSelector((s) => s.tickets.items);
  const openIssues = ticketItems.filter((t) => ticketInvoice(t)?.vcode === code).filter((t) => t.status === 'Open' || t.status === 'In Progress').length;

  return (
    <ModalShell
      title={code}
      width={420}
      foot={(
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
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
          <button type="button" className="btn" onClick={() => dispatch(closeModal())}>Close</button>
        </div>
      )}
    >
      <div className="validation-row"><span>Supplier</span><span style={{ fontWeight: 700 }}>{supplier}</span></div>
      <div className="validation-row"><span>PAN</span><span>{panFor(supplier)}</span></div>
      <div className="validation-row"><span>Contact Email</span><span>{supplierEmailFor(supplier)}</span></div>
      <div className="validation-row"><span>Contact Phone</span><span>{synthPhone(supplier)}</span></div>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', display: 'block', margin: '14px 0 8px' }}>On This Vendor Code</label>
      <div className="validation-row"><span>Total Invoices</span><span>{invoices.length}</span></div>
      <div className="validation-row"><span>Purchase Orders</span><span>{poCount}</span></div>
      <div className="validation-row"><span>Open Queries</span><span>{openIssues}</span></div>
    </ModalShell>
  );
}
