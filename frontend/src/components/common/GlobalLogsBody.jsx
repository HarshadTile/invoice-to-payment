import { useDispatch, useSelector } from 'react-redux';
import { CHANNELS } from '../../data/constants';
import { getGlobalHistory } from '../../utils/businessLogic';
import { setSearch, setTablePage, setGlobalLogsChannel, setGlobalLogsStatus, openModal } from '../../features/ui/uiSlice';
import PagerFoot from './PagerFoot.jsx';
import Badge from './Badge.jsx';

const PAGE_SIZE = 15;
const TONE = { Failed: 'red', Completed: 'green', 'In Progress': 'blue' };

export default function GlobalLogsBody({ invoiceList, tableKey }) {
  const dispatch = useDispatch();
  const tickets = useSelector((s) => s.tickets.items);
  const search = useSelector((s) => s.ui.search[tableKey] || '');
  const page = useSelector((s) => s.ui.tablePage[tableKey] || 1);
  const chFilter = useSelector((s) => s.ui.globalLogsChannel) || '';
  const stFilter = useSelector((s) => s.ui.globalLogsStatus) || '';

  const allRows = getGlobalHistory(invoiceList, tickets);
  let rows = allRows;
  if (chFilter) rows = rows.filter((r) => r.channel === chFilter);
  if (stFilter) rows = rows.filter((r) => r.status === stFilter);
  const q = search.trim().toLowerCase();
  if (q) rows = rows.filter((r) => [r.no, r.vcode, r.vendor, r.po, r.event, r.stage, r.person, r.role].join(' ').toLowerCase().includes(q));

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const statuses = [...new Set(allRows.map((r) => r.status))];

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="toolbar">
          <div className="toolbar-left">
            <input
              className="search-box"
              style={{ width: 320 }}
              placeholder="Search invoice no, vendor code, vendor, PO no, action, stage, performed by..."
              value={search}
              onChange={(e) => dispatch(setSearch({ key: tableKey, value: e.target.value }))}
            />
            <select value={chFilter} onChange={(e) => dispatch(setGlobalLogsChannel(e.target.value))} style={{ marginLeft: 10, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5 }}>
              <option value="">All Channels</option>
              {CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <select value={stFilter} onChange={(e) => dispatch(setGlobalLogsStatus(e.target.value))} style={{ marginLeft: 8, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5 }}>
              <option value="">All Statuses</option>
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Date/Time</th><th>Invoice No</th><th>Vendor Code</th><th>PO No</th><th>Action</th><th>Stage</th><th>Performed By</th><th>Role</th><th>Status</th></tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && <tr><td colSpan={9} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>No log entries match your filters.</td></tr>}
              {pageRows.map((r, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                  <td><button type="button" className="link-hero" onClick={() => dispatch(openModal({ kind: 'invoiceDetail', ctx: { no: r.no } }))}>{r.no}</button></td>
                  <td><button type="button" className="link-hero" onClick={() => dispatch(openModal({ kind: 'vendorCodePreview', ctx: { code: r.vcode } }))}>{r.vcode}</button></td>
                  <td>{r.po}</td>
                  <td>{r.event}</td>
                  <td style={{ whiteSpace: 'normal', maxWidth: 220 }}>{r.stage}</td>
                  <td>{r.person}</td>
                  <td>{r.role}</td>
                  <td><Badge tone={TONE[r.status] || 'gray'}>{r.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PagerFoot total={rows.length} page={currentPage} pageSize={PAGE_SIZE} onPage={(p) => dispatch(setTablePage({ key: tableKey, page: p }))} />
      </div>
    </>
  );
}
