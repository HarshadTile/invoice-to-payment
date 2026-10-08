import { useDispatch, useSelector } from 'react-redux';
import { setSearch, setTablePage, openModal } from '../../features/ui/uiSlice';
import PagerFoot from '../common/PagerFoot.jsx';
import Badge from './Badge.jsx';
import { Upload, Download, Plus, Inbox, Mail, Edit, Trash } from './icons.jsx';

const PAGE_SIZE = 20;

function renderCell(v) {
  if (v === '-') return <span style={{ color: '#CBD5E1' }}>-</span>;
  if (['Yes', 'Active', 'Success', 'Paid', 'Approved'].includes(v)) return <Badge tone="green">{v}</Badge>;
  if (['No', 'Inactive', 'Failed', 'Rejected', 'Deleted'].includes(v)) return <Badge tone="red">{v}</Badge>;
  if (['Pending', 'Pending Approval'].includes(v)) return <Badge tone="amber">{v}</Badge>;
  return v;
}

/**
 * A generic, permission-aware CRUD table over an array-of-arrays row store (tablesSlice).
 * Mirrors the reference app's renderTableBlock: search, pagination, add/edit/delete,
 * optional import/export, optional statusCol (invoice/vendor-code quick links + notify).
 */
export default function EditableTable({
  tableKey, cols, rows, canEdit = true, canImportExport = true,
  allowAdd = true, addLabel = '+ Add Row', statusCol = false,
  onViewInvoice, onViewVendorCode, onNotify,
}) {
  const dispatch = useDispatch();
  const search = useSelector((s) => s.ui.search[tableKey] || '');
  const page = useSelector((s) => s.ui.tablePage[tableKey] || 1);

  const q = search.toLowerCase();
  const filtered = rows.filter((r) => !q || r.some((c) => String(c).toLowerCase().includes(q)));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const vcodeIdx = statusCol ? cols.indexOf('Vendor Code') : -1;

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-left">
          <input className="search-box" style={{ width: 260 }} placeholder="Search this table..." value={search} onChange={(e) => dispatch(setSearch({ key: tableKey, value: e.target.value }))} />
        </div>
        <div className="toolbar-right">
          {canImportExport && (
            <>
              <button type="button" className="btn" disabled={!canEdit} title={!canEdit ? 'Not permitted for your role' : undefined} onClick={() => dispatch(openModal({ kind: 'import', ctx: { tableKey } }))}><Upload />Import</button>
              <button type="button" className="btn" onClick={() => dispatch(openModal({ kind: 'export', ctx: { tableKey, cols, rows, label: tableKey } }))}><Download />Export</button>
            </>
          )}
          {allowAdd && (
            <button type="button" className="btn primary" disabled={!canEdit} title={!canEdit ? 'Not permitted for your role' : undefined} onClick={() => dispatch(openModal({ kind: 'row', ctx: { tableKey, cols, rows, idx: null } }))}><Plus />{addLabel.replace(/^\+\s*/, '')}</button>
          )}
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {cols.map((c) => <th key={c}>{c}</th>)}
              {statusCol && <th>Notify</th>}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr><td colSpan={cols.length + 1 + (statusCol ? 1 : 0)}>
                <div className="empty-state">
                  <Inbox />
                  <b>Nothing to show</b>
                  <span>{search ? 'No rows match your search.' : 'This table has no entries yet.'}</span>
                </div>
              </td></tr>
            )}
            {pageRows.map((r) => {
              const rowIdx = rows.indexOf(r);
              return (
                <tr key={rowIdx}>
                  {r.map((c, ci) => {
                    if (statusCol && ci === 0) return <td key={ci}><button type="button" className="link-hero" title="Click for full stage-by-stage status" onClick={() => onViewInvoice && onViewInvoice(r[0])}>{c}</button></td>;
                    if (statusCol && ci === vcodeIdx) return <td key={ci}><button type="button" className="link-hero" title={`Preview ${c}`} onClick={() => onViewVendorCode && onViewVendorCode(c)}>{c}</button></td>;
                    return <td key={ci}>{renderCell(c)}</td>;
                  })}
                  {statusCol && <td><button type="button" className="kebab" title="Notify Supplier: preview To / CC" aria-label="Notify supplier" onClick={() => onNotify && onNotify(r[0])}><Mail /></button></td>}
                  <td style={{ display: 'flex', gap: 4 }}>
                    <button type="button" className="kebab" disabled={!canEdit} title="Edit" aria-label="Edit row" onClick={() => dispatch(openModal({ kind: 'row', ctx: { tableKey, cols, rows, idx: rowIdx } }))}><Edit /></button>
                    <button
                      type="button"
                      className="kebab"
                      disabled={!canEdit}
                      title="Delete"
                      aria-label="Delete row"
                      onClick={() => dispatch(openModal({
                        kind: 'confirm',
                        ctx: {
                          title: tableKey === 'settings-users' ? 'Remove User' : 'Delete Row',
                          message: tableKey === 'settings-users'
                            ? `Remove ${r[0] || 'this user'} from the user list? This change will be saved immediately.`
                            : 'Delete this row? This change will be saved immediately.',
                          confirmLabel: tableKey === 'settings-users' ? 'Remove User' : 'Delete Row',
                          action: {
                            type: 'deleteRow',
                            payload: { key: tableKey, idx: rowIdx },
                            success: tableKey === 'settings-users' ? 'User removed.' : 'Row deleted.',
                          },
                        },
                      }))}
                    ><Trash /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <PagerFoot total={filtered.length} page={currentPage} pageSize={PAGE_SIZE} onPage={(p) => dispatch(setTablePage({ key: tableKey, page: p }))} />
    </div>
  );
}
