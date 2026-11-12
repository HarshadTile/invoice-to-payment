import { SRM_COLUMNS } from '../../utils/srmWorkspace';
import { formatInvoiceDate } from '../../utils/invoiceDates';

// Same readers as the Msetu / SRM register's Approvals / All fields columns, so both always agree.
const KEYS = ['approvalStatus', 'statusFlag', 'pending', 'approvedBy',
  ...Array.from({ length: 7 }, (_, index) => `approver${index + 1}`),
  'approvalDate', 'accountsDate', 'remarks', 'miroStatus', 'miroDate', 'postingDate'];
const FIELDS = KEYS.map((key) => SRM_COLUMNS.find((column) => column.key === key)).filter(Boolean);

/** Approval chain and SAP posting dates of a Msetu / SRM invoice, for the internal team only
 *  (suppliers don't see approver names). Approvers with no name are left out. */
export default function SrmDetails({ invoice, internal = false }) {
  if (!internal || invoice.channel !== 'msetuSrm') return null;
  const shown = FIELDS.map((field) => {
    const raw = field.read(invoice);
    const value = field.type === 'date' ? formatInvoiceDate(raw) : raw;
    return [field.key, field.label, value == null || String(value).trim() === '' ? '-' : String(value)];
  }).filter(([key, , value]) => !(key.startsWith('approver') && value === '-'));
  return <>
    <h4 className="inv-section-title">Msetu / SRM Approvals &amp; SAP</h4>
    <div className="detail-grid">
      {shown.map(([key, label, value]) => <div className="detail-item" key={key}><span>{label}</span><span>{value}</span></div>)}
    </div>
  </>;
}
