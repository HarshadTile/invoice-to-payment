/* Logs / History helpers shared by the staff and supplier logs: the quick date ranges and the
 * one-line milestone trail. */
import { getFiscalYear } from './fiscalYear';

/** yyyy-mm-dd for a local date (what the date inputs and the server use). */
export function localIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** The quick date ranges for the live log. "Last 7 days" includes today. */
export function logRanges(today = new Date()) {
  const daysBack = (n) => localIsoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (n - 1)));
  const to = localIsoDate(today);
  const fyStart = `${getFiscalYear(`${to}T00:00:00`).split("-")[0]}-04-01`;
  return [
    { key: 'd7', label: 'Last 7 days', from: daysBack(7), to },
    { key: 'd30', label: '30 days', from: daysBack(30), to },
    { key: 'd90', label: '90 days', from: daysBack(90), to },
    { key: 'fy', label: 'This FY', from: fyStart, to },
    { key: 'all', label: 'All dates', from: '', to: '' },
  ];
}

/** "Uploaded 03 Nov → Booked 04 Nov → Paid 05 Nov": an invoice's milestones on one line. */
const STEP_LABEL = {
  'Invoice dated': 'Dated', 'Invoice uploaded': 'Uploaded', 'Invoice approved': 'Approved', 'Sent to accounts': 'To accounts',
  'MIRO document dated': 'MIRO dated', 'Posted in SAP': 'Posted', 'Booked in SAP': 'Booked', 'Payment cleared': 'Paid',
  'Payment completed': 'Paid', 'Invoice rejected': 'Rejected', 'Invoice deleted': 'Deleted',
};
const SHORT_DAY = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' });
export function trailText(trail = []) {
  return trail.map((step) => `${STEP_LABEL[step.event] || step.event} ${SHORT_DAY.format(step.when)}`).join(' → ');
}
