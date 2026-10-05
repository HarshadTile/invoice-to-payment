import { useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { CHANNEL_LABEL, TICKET_CATEGORIES, TICKET_PRIORITIES } from '../../data/constants';
import { selectScopedInvoices } from '../../features/invoices/selectors';
import { useCreateTicketMutation, useUploadAttachmentMutation } from '../../features/tickets/ticketsApi';
import { closeModal, pushToast } from '../../features/ui/uiSlice';
import ModalShell from './ModalShell.jsx';

export default function RaiseTicketModal({ ctx }) {
  const dispatch = useDispatch();
  const invoices = useSelector(selectScopedInvoices);
  const authType = useSelector((state) => state.auth.authType);
  const supplierCode = useSelector((state) => state.auth.supplierLoginVcode);
  const availableInvoices = authType === 'supplier'
    ? invoices.filter((item) => item.vcode === supplierCode)
    : invoices;
  const [invoiceNo, setInvoiceNo] = useState(ctx.no || availableInvoices[0]?.no || '');
  const [category, setCategory] = useState(TICKET_CATEGORIES[0]);
  const [priority, setPriority] = useState('Medium');
  const [subject, setSubject] = useState('');
  const [desc, setDesc] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [error, setError] = useState('');
  const idempotencyKey = useRef(crypto.randomUUID());
  const [createTicket, { isLoading: isCreating }] = useCreateTicketMutation();
  const [uploadAttachment, { isLoading: isUploading }] = useUploadAttachmentMutation();
  const inv = availableInvoices.find((item) => item.no === invoiceNo);

  if (!inv) return null;

  async function submit() {
    if (!subject.trim() || !desc.trim()) {
      setError('Enter a subject and description.');
      return;
    }
    if (attachment && attachment.size > 5 * 1024 * 1024) {
      setError('Attachment must be 5 MB or smaller.');
      return;
    }
    setError('');
    let created;
    try {
      created = await createTicket({
        invoice_no: inv.no,
        category,
        priority: priority.toUpperCase(),
        subject: subject.trim(),
        description: desc.trim(),
        idempotencyKey: idempotencyKey.current,
      }).unwrap();
      if (attachment) {
        await uploadAttachment({
          id: created.id,
          file: attachment,
          visibility: 'PUBLIC',
          expected_version: created.row_version,
        }).unwrap();
      }
      dispatch(closeModal());
      dispatch(pushToast('Query submitted and routed.'));
    } catch (requestError) {
      if (created) {
        dispatch(closeModal());
        dispatch(pushToast('Query submitted, but the attachment could not be uploaded.'));
        return;
      }
      setError(requestError?.data?.message || 'Could not submit this query.');
    }
  }

  return (
    <ModalShell
      title="Raise a Query"
      width={680}
      foot={(
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <button type="button" className="btn" onClick={() => dispatch(closeModal())}>Cancel</button>
          <button type="button" className="btn primary" disabled={isCreating || isUploading} onClick={submit}>
            {isCreating || isUploading ? 'Submitting...' : 'Submit Query'}
          </button>
        </div>
      )}
    >
      <div className="form-field">
        <label htmlFor="ticket-invoice">Invoice</label>
        <select id="ticket-invoice" value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)}>
          {availableInvoices.map((item, index) => (
            <option key={`${item.no}-${item.poItem}-${index}`} value={item.no}>
              {item.no} | PO {item.po} | {item.amount}
            </option>
          ))}
        </select>
      </div>
      <div className="ticket-form-grid">
        <div className="form-field">
          <label>Topic</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {TICKET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            {TICKET_PRIORITIES.filter((p) => p !== 'Urgent').map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div className="form-field">
        <label>Subject</label>
        <input maxLength={150} placeholder="Briefly describe the query" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="form-field">
        <label>Details</label>
        <textarea rows={5} placeholder="What's the query..." value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>
      <div className="form-field">
        <label htmlFor="ticket-attachment">Attachment <span className="field-optional">(optional)</span></label>
        <input
          id="ticket-attachment"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv,.docx"
          onChange={(event) => setAttachment(event.target.files?.[0] || null)}
        />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="ticket-route-note">
        Sent to: <b>{CHANNEL_LABEL[inv.channel] || inv.channel}</b> channel
      </p>
    </ModalShell>
  );
}
