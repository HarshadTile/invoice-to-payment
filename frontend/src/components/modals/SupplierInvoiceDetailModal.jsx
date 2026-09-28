import { useDispatch } from 'react-redux';
import { runtime } from '../../data/runtime';
import { CHANNEL_LABEL } from '../../data/constants';
import { combinedStatusFor, currentHandlerFor, currentStageName } from '../../utils/businessLogic';
import { openModal } from '../../features/ui/uiSlice';
import ModalShell from './ModalShell.jsx';
import Badge from '../common/Badge.jsx';

export default function SupplierInvoiceDetailModal({ ctx }) {
  const dispatch = useDispatch();
  const inv = runtime.invoices.find((i) => i.no === ctx.no);
  if (!inv) return null;
  const cs = combinedStatusFor(inv);
  const contact = currentHandlerFor(inv);
  const siblingInvoices = runtime.invoices.filter((i) => i.po === inv.po && i.no !== inv.no);

  return (
    <ModalShell
      title={inv.no}
      width={480}
      foot={(
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <button type="button" className="btn" onClick={() => dispatch(openModal({ kind: 'raiseTicket', ctx: { no: inv.no } }))}>✉ Raise a Query</button>
        </div>
      )}
    >
      <div style={{ textAlign: 'center', padding: '2px 0 16px' }}>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{CHANNEL_LABEL[inv.channel]}</div>
        <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text)', marginTop: 8, lineHeight: 1.4 }}>{currentStageName(inv)}</div>
        <div style={{ marginTop: 12 }}><Badge tone={cs.tone}>{cs.label}</Badge></div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>{cs.reason}</div>
      </div>
      <div className="validation-row"><span>Vendor Code</span><span className="mono">{inv.vcode}</span></div>
      <div className="validation-row"><span>PO No</span><span>{inv.po}</span></div>
      <div className="validation-row"><span>Amount</span><span>{inv.amount}</span></div>
      <div className="validation-row"><span>UTR No.</span><span>{inv.utr === '-' ? <span style={{ color: '#CBD5E1' }}>Not yet visible</span> : inv.utr}</span></div>
      {inv.shortPayReason && <div className="validation-row"><span>Reason for Less Paid</span><span style={{ textAlign: 'right', maxWidth: 260 }}>{inv.shortPayReason}</span></div>}
      <div className="validation-row">
        <span>Contact for This Invoice</span>
        <span style={{ textAlign: 'right' }}>
          {contact.name}{contact.name !== 'MDE Invoice Team' ? ` (${contact.role})` : ''}<br />
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{contact.email}</span>
        </span>
      </div>
      {siblingInvoices.length > 0 && (
        <>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Other Invoices on PO {inv.po}</label>
          <div style={{ marginTop: 8 }}>
            {siblingInvoices.map((s, rowIndex) => (
              <div className="validation-row" key={`${s.no}-${rowIndex}`}><span>{s.no}</span><Badge tone={combinedStatusFor(s).tone}>{combinedStatusFor(s).label}</Badge></div>
            ))}
          </div>
        </>
      )}
    </ModalShell>
  );
}
