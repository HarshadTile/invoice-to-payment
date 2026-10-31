import { useDispatch, useSelector } from 'react-redux';
import { selectScopedInvoices } from '../../features/invoices/selectors';
import { CHANNEL_LABEL } from '../../data/constants';
import { combinedStatusFor, currentStageName, findInvoice, invoiceProductType } from '../../utils/businessLogic';
import PoPortalDetails from '../invoices/PoPortalDetails.jsx';
import { formatInvoiceDate } from '../../utils/invoiceDates';
import { closeModal } from '../../features/ui/uiSlice';
import ModalShell from './ModalShell.jsx';
import { useLocation } from 'react-router-dom';
import { Breadcrumb } from '../layout/Breadcrumb.jsx';
import { shortPageTitle } from '../../utils/pageTitle';
import Badge from '../common/Badge.jsx';

export default function SupplierInvoiceDetailModal({ ctx }) {
  const dispatch = useDispatch();
  const { pathname } = useLocation();
  const invoices = useSelector(selectScopedInvoices);
  const inv = findInvoice(ctx.no, ctx.poItem, invoices, ctx);
  if (!inv) return null;
  const cs = combinedStatusFor(inv);
  // Same invoice number can legitimately repeat as separate PO line items — exclude
  // this exact row (by no + poItem), not every row sharing just the invoice number.
  const siblingInvoices = invoices.filter((i) => i.po === inv.po && !(i.no === inv.no && i.poItem === inv.poItem));

  return (
    <ModalShell
      title={inv.no}
      width={480}
      foot={(
        <button type="button" className="btn" onClick={() => dispatch(closeModal())}>Close</button>
      )}
    >
      <Breadcrumb parent={shortPageTitle(pathname)} current="Invoice Details" onBack={() => dispatch(closeModal())} />
      <div style={{ textAlign: 'center', padding: '0.125rem 0 1rem' }}>
        <div style={{ fontSize: '0.71875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{CHANNEL_LABEL[inv.channel]}</div>
        <div style={{ fontSize: '0.96875rem', fontWeight: 700, color: 'var(--text)', marginTop: '0.5rem', lineHeight: 1.4 }}>{currentStageName(inv)}</div>
        <div style={{ marginTop: '0.75rem' }}><Badge tone={cs.tone}>{cs.label}</Badge></div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem', maxWidth: '22.5rem', marginLeft: 'auto', marginRight: 'auto' }}>{cs.reason}</div>
      </div>
      <div className="validation-row"><span>Vendor Code</span><span className="mono">{inv.vcode}</span></div>
      <div className="validation-row"><span>PO No</span><span>{inv.po}</span></div>
      <div className="validation-row"><span>PO Item</span><span>{inv.poItem === '' || inv.poItem == null ? '-' : inv.poItem}</span></div>
      <div className="validation-row"><span>Product Type</span><span>{invoiceProductType(inv)}</span></div>
      <div className="validation-row"><span>Amount</span><span>{inv.amount}</span></div>
      <div className="validation-row"><span>Invoice Date</span><span>{formatInvoiceDate(inv.rawDate)}</span></div>
      <div className="validation-row"><span>Upload Date</span><span>{formatInvoiceDate(inv.rawUploadDate)}</span></div>
      <div className="validation-row"><span>Approval Date</span><span>{formatInvoiceDate(inv.workflow?.final_approval_date)}</span></div>
      <div className="validation-row"><span>MIRO Booked Date</span><span>{formatInvoiceDate(inv.sap?.miro_booking_date || inv.sap?.document_date)}</span></div>
      <div className="validation-row"><span>Payment Due Date</span><span>{formatInvoiceDate(inv.sap?.net_due_date)}</span></div>
      <div className="validation-row"><span>Payment Date</span><span>{formatInvoiceDate(inv.sap?.clearing_date)}</span></div>
      <div className="validation-row"><span>UTR No.</span><span>{inv.utr === '-' ? <span style={{ color: '#CBD5E1' }}>Not yet visible</span> : inv.utr}</span></div>
      {inv.status === 'Rejected' && <div role="alert" style={{ marginTop: '0.75rem', padding: '0.75rem', borderRadius: '0.5rem', background: 'var(--brand-tint)', color: 'var(--brand-dark)' }}>
        <strong>Rejection reason:</strong> {inv.rejectionReason || inv.workflow?.rejection_reason || inv.shortPayReason || 'Not provided'}
      </div>}
      <PoPortalDetails invoice={inv} />
      {inv.shortPayReason && !inv.rejectionReason && !inv.workflow?.rejection_reason && inv.status !== 'Rejected' && <div className="validation-row"><span>Reason for Less Paid</span><span style={{ textAlign: 'right', maxWidth: '16.25rem' }}>{inv.shortPayReason}</span></div>}
      {siblingInvoices.length > 0 && (
        <>
          <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Other Invoices on PO {inv.po}</label>
          <div style={{ marginTop: '0.5rem' }}>
            {siblingInvoices.map((s, rowIndex) => (
              <div className="validation-row" key={`${s.no}-${rowIndex}`}><span>{s.no}</span><Badge tone={combinedStatusFor(s).tone}>{combinedStatusFor(s).label}</Badge></div>
            ))}
          </div>
        </>
      )}
    </ModalShell>
  );
}
