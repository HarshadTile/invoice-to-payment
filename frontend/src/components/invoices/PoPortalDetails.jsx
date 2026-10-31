import { formatInvoiceDate } from '../../utils/invoiceDates';

export default function PoPortalDetails({ invoice, internal = false }) {
  const po = invoice.poPortal;
  if (!po) return null;
  const fields = [
    ['Service Code', po.service], ['Service Line', po.line_number], ['Service Entry Sheet', po.entry_sheet],
    ['Service Entry Date', formatInvoiceDate(po.entry_sheet_creation_date)], ['PO Type', po.po_type],
    ...(internal ? [['Source Approval Stage', po.source_approval_stage], ['Recorded Approval Stage', po.approval_stage],
      ['HOD1', po.hod1], ['HOD1 Status', po.hod1_status], ['HOD2', po.hod2], ['HOD2 Status', po.hod2_status],
      ['Accounts User', po.accounts_user], ['Accounts Status', po.accounts_status], ['Comments', po.comments]] : []),
  ];
  return <>
    <h4 className="inv-section-title">PO Portal Details</h4>
    <div className="detail-grid">
      {fields.map(([label, value]) => <div className="detail-item" key={label}><span>{label}</span><span>{value || '-'}</span></div>)}
      {(invoice.rejectionReason || invoice.workflow?.rejection_reason) && <div className="detail-item wide">
        <span>{invoice.status === 'Rejected' ? 'Rejection Reason' : 'Review / Rejection Comment'}</span>
        <span>{invoice.rejectionReason || invoice.workflow.rejection_reason}</span>
      </div>}
    </div>
    {internal && <p className="detail-note">HOD2 assignment is inferred from Created_by_HOD2. Original approval values are shown above.</p>}
  </>;
}
