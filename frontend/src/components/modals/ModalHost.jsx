import { useSelector } from 'react-redux';
import InvoiceDetailModal from './InvoiceDetailModal.jsx';
import SupplierInvoiceDetailModal from './SupplierInvoiceDetailModal.jsx';
import StageSimpleModal from './StageSimpleModal.jsx';
import VendorCodePreviewModal from './VendorCodePreviewModal.jsx';
import RaiseTicketModal from './RaiseTicketModal.jsx';
import TicketDetailModal from './TicketDetailModal.jsx';
import NotifyPreviewModal from './NotifyPreviewModal.jsx';
import ExportModal from './ExportModal.jsx';
import ConfirmModal from './ConfirmModal.jsx';

const REGISTRY = {
  invoiceDetail: InvoiceDetailModal,
  supplierInvoiceDetail: SupplierInvoiceDetailModal,
  stageSimple: StageSimpleModal,
  vendorCodePreview: VendorCodePreviewModal,
  raiseTicket: RaiseTicketModal,
  ticketDetail: TicketDetailModal,
  notifyPreview: NotifyPreviewModal,
  export: ExportModal,
  confirm: ConfirmModal,
};

export default function ModalHost() {
  const modal = useSelector((s) => s.ui.modal);
  if (!modal) return null;
  const Comp = REGISTRY[modal.kind];
  if (!Comp) return null;
  return <Comp ctx={modal.ctx} />;
}
