import { useSelector } from 'react-redux';
import { downloadCSV } from '../../utils/businessLogic';
import { channelLabel, formatDate, STATUS_LABEL } from '../../utils/tickets';
import { Download } from '../common/icons.jsx';

export default function TicketExportButton({ tickets = [], loading = false }) {
  const supplier = useSelector((state) => state.auth.authType === 'supplier');
  const exportTickets = () => {
    const columns = ['Query No', 'Subject', 'Invoice No', 'Channel', ...(!supplier ? ['Vendor Code'] : []), 'Category', 'Priority', 'Owner', 'Updated', 'SLA', 'Status'];
    const rows = tickets.map((ticket) => [
      ticket.ticket_no, ticket.subject, ticket.invoice_no || 'Not linked', channelLabel(ticket.channel),
      ...(!supplier ? [ticket.vendor_code || '-'] : []),
      ticket.category, ticket.priority, ticket.assignee?.name || ticket.assignee?.team || 'Unassigned',
      formatDate(ticket.updated_at, true),
      ticket.sla?.breached ? 'Breached' : ticket.awaiting === 'STAFF' ? 'Staff' : 'Supplier',
      STATUS_LABEL[ticket.status] || ticket.status,
    ].map((value) => {
      const text = String(value ?? '');
      // User-entered subjects and other text must remain text in spreadsheet apps.
      return /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
    }));
    downloadCSV(supplier ? 'My_Queries' : 'Inquiry_Desk', columns, rows);
  };

  return (
    <button type="button" className="btn" disabled={loading || !tickets.length} onClick={exportTickets}
      title="Export the queries in the current view as CSV" style={{ whiteSpace: 'nowrap' }}>
      <Download /> Export CSV ({tickets.length})
    </button>
  );
}
