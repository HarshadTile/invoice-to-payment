/* Sample invoice register spanning all 4 channels; several rows use the real Tata
   Communications vendor codes so the Vendor Code Mapping master ties back to live records. */
export const INVOICE_DATA = [
  { no: 'INV-MS-1001', vcode: 'DIT00388AC', vendor: 'Tata Communications Ltd', channel: 'msetuSrm', po: '4500123456', amount: '₹1,24,500', status: 'Paid', utr: 'UTR2607290012', date: '29 Jul 2026' },
  { no: 'INV-MS-1002', vcode: 'DIT00388AA', vendor: 'Tata Communications Ltd', channel: 'msetuSrm', po: '4500123789', amount: '₹58,200', status: 'Payment Due', utr: '-', date: '02 Aug 2026' },
  { no: 'INV-MS-1003', vcode: 'TCLW15', vendor: 'Tata Communications Ltd', channel: 'msetuSrm', po: '4500124011', amount: '₹2,10,000', status: 'Pending Approval', utr: '-', date: '04 Aug 2026' },
  { no: 'INV-PP-2001', vcode: 'V123', vendor: 'Tata Communications Ltd', channel: 'poPortal', po: '4500098233', amount: '₹76,340', status: 'Booked', utr: '-', date: '27 Jul 2026' },
  { no: 'INV-PP-2002', vcode: 'DIT00388AP', vendor: 'Tata Communications Ltd', channel: 'poPortal', po: '4500098450', amount: '₹45,000', status: 'Paid', utr: 'UTR2607250098', date: '25 Jul 2026', shortPayReason: 'Debit note DN-2207 raised for quantity shortfall; ₹6,200 deducted at payment.' },
  { no: 'INV-MN-3001', vcode: 'DIT00388AE', vendor: 'Tata Communications Ltd', channel: 'manual', po: '4500077651 (Capex)', amount: '₹3,15,600', status: 'Approved', utr: '-', date: '22 Jul 2026' },
  { no: 'INV-MN-3002', vcode: 'DIT00388AM', vendor: 'Tata Communications Ltd', channel: 'manual', po: '4500077820', amount: '₹92,150', status: 'Uploaded', utr: '-', date: '05 Aug 2026' },
  { no: 'INV-MF-4001', vcode: 'DIT00388AB', vendor: 'Tata Communications Ltd', channel: 'mfoxPortal', po: '4500055011', amount: '$12,400', status: 'Paid', utr: 'UTR2607200045', date: '20 Jul 2026' },
  { no: 'INV-MF-4002', vcode: 'DIT00388AS', vendor: 'Tata Communications Ltd', channel: 'mfoxPortal', po: '4500055230', amount: '$8,760', status: 'Payment Due', utr: '-', date: '01 Aug 2026' },
  { no: 'INV-MS-1004', vcode: 'BSC00021', vendor: 'Bosch Auto Components', channel: 'msetuSrm', po: '4500129901', amount: '₹4,40,000', status: 'Paid', utr: 'UTR2607180077', date: '18 Jul 2026' },
  { no: 'INV-PP-2003', vcode: 'CNT00187', vendor: 'Continental AG', channel: 'poPortal', po: '4500099120', amount: '₹1,08,750', status: 'Payment Due', utr: '-', date: '03 Aug 2026' },
  { no: 'INV-MN-3003', vcode: 'BFL00456', vendor: 'Bharat Forge Ltd', channel: 'manual', po: '4500078012 (Capex)', amount: '₹6,20,000', status: 'Pending Approval', utr: '-', date: '05 Aug 2026' },
  { no: 'INV-MF-4003', vcode: 'SDV00301', vendor: 'Sandvik India', channel: 'mfoxPortal', po: '4500056100', amount: '$21,300', status: 'Booked', utr: '-', date: '30 Jul 2026' },
  { no: 'INV-MS-1005', vcode: 'DIT00388AH', vendor: 'Tata Communications Ltd', channel: 'msetuSrm', po: '4500124188', amount: '₹33,900', status: 'Deleted', utr: '-', date: '06 Aug 2026' },
  { no: 'INV-MS-1006', vcode: 'DIT00388AC', vendor: 'Tata Communications Ltd', channel: 'msetuSrm', po: '4500131002', amount: '₹87,300', status: 'Pending Approval', utr: '-', date: '08 Aug 2026' },
  { no: 'INV-MS-1007', vcode: 'DIT00388AC', vendor: 'Tata Communications Ltd', channel: 'msetuSrm', po: '4500132456', amount: '₹19,400', status: 'Uploaded', utr: '-', date: '10 Aug 2026' },
  { no: 'INV-PP-2004', vcode: 'DIT00388AP', vendor: 'Tata Communications Ltd', channel: 'poPortal', po: '4500098980', amount: '₹1,52,000', status: 'Booked', utr: '-', date: '01 Aug 2026' },
  { no: 'INV-MF-4004', vcode: 'DIT00388AB', vendor: 'Tata Communications Ltd', channel: 'mfoxPortal', po: '4500055470', amount: '$5,600', status: 'Payment Due', utr: '-', date: '08 Aug 2026' },
  { no: 'INV-MS-1008', vcode: 'BSC00021', vendor: 'Bosch Auto Components', channel: 'msetuSrm', po: '4500129940', amount: '₹2,15,000', status: 'Payment Due', utr: '-', date: '09 Aug 2026' },
];

export const SYNC_LOG = [
  { channel: 'Msetu / SRM', time: '06 Aug 2026, 07:00 AM', status: 'Success', records: 214, msg: '214 invoices pulled, 0 errors' },
  { channel: 'PO Portal', time: '06 Aug 2026, 07:02 AM', status: 'Success', records: 58, msg: '58 service-entry invoices pulled' },
  { channel: 'SAP: FBL1N', time: '06 Aug 2026, 07:05 AM', status: 'Success', records: 412, msg: 'Vendor-wise payment status & UTR refreshed' },
  { channel: 'MFOX Portal', time: '06 Aug 2026, 07:08 AM', status: 'Failed', records: 0, msg: 'Connection timeout: retry scheduled 08:00 AM' },
  { channel: 'Manual (Email Inbox)', time: '05 Aug 2026, 06:55 PM', status: 'Success', records: 9, msg: '9 email approvals parsed' },
];
