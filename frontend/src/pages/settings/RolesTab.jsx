import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { settingsApi } from '../../api/settingsApi';
import { createRole, deleteRole, loadRoleSummary, renameRole, togglePermission } from '../../features/settings/settingsSlice';
import { pushToast } from '../../features/ui/uiSlice';
import ModalShell from '../../components/modals/ModalShell.jsx';
import { Plus, Edit, Trash, ChevronRight, Search, Users, Lock } from '../../components/common/icons.jsx';

// Mirrors ADMIN_LOCKED_CAPABILITIES on the server (app/core/permissions.py).
const ADMIN_LOCKED = ['manageUsers', 'manageConfig', 'manageRoles', 'manageSuppliers'];
const CAPS = [
  ['createTrace', 'Search invoices'],
  ['importExport', 'Export data'],
  ['viewSupplierVisibility', 'View Supplier Visibility'],
  ['viewReports', 'View Vendor Status Reports'],
  ['viewLogs', 'View Logs / History'],
  ['manageConfig', 'Manage integration settings'],
  ['manageUsers', 'Manage users'],
  ['manageRoles', 'Manage roles and permissions'],
  ['viewAuditLog', 'View audit logs'],
  ['manageSuppliers', 'Manage suppliers'],
];

/** Roles & Permissions: the roles on the left, the chosen role's permissions on the right.
 *  Roles can be created (blank or copied), renamed and deleted; Admin is fixed. */
export default function RolesTab() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const roleMatrix = useSelector((s) => s.settings.roleMatrix);
  const roles = Object.keys(roleMatrix);
  const [counts, setCounts] = useState({});
  const [picked, setPicked] = useState('');
  const [dialog, setDialog] = useState(null); // { type: 'create' | 'rename' | 'delete' }

  useEffect(() => {
    dispatch(loadRoleSummary()).then((r) => setCounts(r.counts || {})).catch(() => {});
  }, [dispatch]);

  const selected = roles.includes(picked) ? picked : (roles.find((r) => r !== 'Admin') || roles[0]);  // the role a dialog acts on
  const capLabel = Object.fromEntries(CAPS);
  const granted = (role) => CAPS.filter(([k]) => roleMatrix[role]?.[k]).length;
  const toast = (msg) => dispatch(pushToast(msg));

  const toggle = (role, capKey) => dispatch(togglePermission({ role, cap: capKey }))
    .catch((err) => toast(err.message || 'Could not save that change.'));
  const done = (result, message, nextSelected) => {
    setCounts(result.counts || {});
    if (nextSelected) setPicked(nextSelected);
    setDialog(null);
    toast(message);
  };

  return (
    <>
      <div className="card">
        <div className="roles-table-head">
          <h3>Role permissions</h3>
          <div className="roles-table-actions">
            <button type="button" className="btn btn-sm" onClick={() => setDialog({ type: 'manage' })}><Edit size={14} />Edit roles</button>
            <button type="button" className="btn btn-sm" onClick={() => setDialog({ type: 'create' })}><Plus size={14} />New role</button>
          </div>
        </div>
        <div className="table-scroll">
          <table className="perm-table roles-table">
            <thead>
              <tr>
                <th>Permission</th>
                {roles.map((r) => (
                  <th key={r}>
                    <span className="roles-col">
                      <span className="roles-col-name">{r}</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPS.map(([capKey, label]) => (
                <tr key={capKey}>
                  <td>{label}</td>
                  {roles.map((r) => {
                    const locked = r === 'Admin' && ADMIN_LOCKED.includes(capKey);
                    return (
                      <td key={r}>
                        <button
                          type="button"
                          className={`check-toggle${roleMatrix[r][capKey] ? ' on' : ''}`}
                          disabled={locked}
                          aria-label={`Allow ${r} to ${label.toLowerCase()}`}
                          aria-pressed={!!roleMatrix[r][capKey]}
                          title={locked ? 'This permission is always enabled for Admin.' : undefined}
                          onClick={() => toggle(r, capKey)}
                        >{roleMatrix[r][capKey] ? '✓' : ''}</button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <TicketPermissionsCard />

      {dialog?.type === 'manage' && (
        <ModalShell title="Edit roles" width={480} onClose={() => setDialog(null)}
          foot={<button type="button" className="btn" onClick={() => setDialog(null)}>Close</button>}>
          <ul className="roles-manage">
            {roles.map((r) => (
              <li key={r}>
                <span className="roles-manage-name"><b>{r}</b><small>{counts[r] ?? 0} user{counts[r] === 1 ? '' : 's'}</small></span>
                {r === 'Admin' ? (
                  <span className="roles-manage-fixed"><Lock size={12} />Fixed</span>
                ) : (
                  <span className="roles-manage-actions">
                    <button type="button" className="btn btn-sm" aria-label={`Rename ${r}`}
                      onClick={() => { setPicked(r); setDialog({ type: 'rename', role: r }); }}><Edit size={13} />Rename</button>
                    <button type="button" className="btn btn-sm roles-delete" aria-label={`Delete ${r}`}
                      onClick={() => { setPicked(r); setDialog({ type: 'delete', role: r }); }}><Trash size={13} />Delete</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </ModalShell>
      )}
      {dialog?.type === 'create' && (
        <RoleNameDialog
          title="New role" submitLabel="Create role" roles={roles} withCopy
          onClose={() => setDialog(null)}
          onSubmit={({ name, copyFrom }) => dispatch(createRole({ name, copyFrom }))
            .then((r) => done(r, `${name.trim()} created.`, Object.keys(r.roleMatrix).find((k) => k.toLowerCase() === name.trim().replace(/\s+/g, ' ').toLowerCase())))}
        />
      )}
      {dialog?.type === 'rename' && (
        <RoleNameDialog
          title={`Rename ${selected}`} submitLabel="Rename" initial={selected} roles={roles}
          note={counts[selected] ? `Its ${counts[selected]} user${counts[selected] === 1 ? '' : 's'} keep the role under the new name.` : ''}
          onClose={() => setDialog(null)}
          onSubmit={({ name }) => dispatch(renameRole(selected, name))
            .then((r) => done(r, `Renamed to ${name.trim()}.`, Object.keys(r.roleMatrix).find((k) => !roles.includes(k)) || selected))}
        />
      )}
      {dialog?.type === 'delete' && (
        <DeleteRoleDialog
          role={selected} users={counts[selected] ?? 0} targets={roles.filter((r) => r !== selected && r !== 'Admin')}
          onClose={() => setDialog(null)}
          onSubmit={(moveTo) => dispatch(deleteRole(selected, moveTo))
            .then((r) => done(r, `${selected} deleted.${moveTo ? ` Its users moved to ${moveTo}.` : ''}`, moveTo || ''))}
        />
      )}
    </>
  );
}

function RoleNameDialog({ title, submitLabel, initial = '', roles, withCopy = false, note = '', onClose, onSubmit }) {
  const [name, setName] = useState(initial);
  const [copyFrom, setCopyFrom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    if (name.trim().length < 2) { setError('Enter a name of at least 2 characters.'); return; }
    setBusy(true);
    setError('');
    try {
      await onSubmit({ name, copyFrom });
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }
  return (
    <ModalShell title={title} width={460} onClose={busy ? () => {} : onClose}
      foot={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form="role-name-form" className="btn primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        </>
      )}>
      <form id="role-name-form" className="roles-form" onSubmit={submit}>
        {error && <div className="form-error" role="alert">{error}</div>}
        <label className="sr-field">Role name
          <input className="search-box" autoFocus maxLength={40} value={name} placeholder="e.g. Invoice Team L4"
            onChange={(e) => setName(e.target.value)} />
        </label>
        {withCopy && (
          <label className="sr-field">Start from
            <select className="search-box" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
              <option value="">No permissions (switch them on next)</option>
              {roles.map((r) => <option key={r} value={r}>Copy of {r}</option>)}
            </select>
          </label>
        )}
        {note && <p className="sr-foot-note">{note}</p>}
      </form>
    </ModalShell>
  );
}

function DeleteRoleDialog({ role, users, targets, onClose, onSubmit }) {
  const [moveTo, setMoveTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    if (users && !moveTo) { setError(`Pick the role its ${users} user${users === 1 ? '' : 's'} should move to.`); return; }
    setBusy(true);
    setError('');
    try {
      await onSubmit(users ? moveTo : '');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }
  return (
    <ModalShell title={`Delete ${role}`} width={460} onClose={busy ? () => {} : onClose}
      foot={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn danger" onClick={submit} disabled={busy || (users > 0 && !moveTo)}>{busy ? 'Deleting…' : 'Delete role'}</button>
        </>
      )}>
      {error && <div className="form-error" role="alert">{error}</div>}
      {users ? (
        <label className="sr-field">{`${users} user${users === 1 ? ' has' : 's have'} this role. Move ${users === 1 ? 'them' : 'them all'} to`}
          <select className="search-box" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="Move users to">
            <option value="">Pick a role…</option>
            {targets.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
      ) : (
        <p className="modal-copy">Nobody has this role, so it can be deleted straight away.</p>
      )}
    </ModalShell>
  );
}

/** Read-only reference: what each Ticket Role may do in the Inquiry Desk. The table comes from the
 *  server, generated from the same rules the ticket endpoints enforce. A user's ticket role
 *  is set per person under Users; it is separate from their application role above. */
function StatusChips({ text, own }) {
  const items = String(text || '').split(',').map((t) => t.trim()).filter(Boolean);
  if (!items.length) return null;
  return <div className={`tp-val${own ? ' own' : ''}`}>{items.join(', ')}{own && <sup>*</sup>}</div>;
}

function TicketPermissionsCard() {
  const [matrix, setMatrix] = useState(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    settingsApi.ticketPermissions()
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data?.roles) && Array.isArray(data?.rows)) setMatrix(data);
        else setFailed(true);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="card tp-card set-card">
      <button type="button" className="tp-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>
          <b>Inquiry Desk ticket roles</b>
          <small>What each ticket role can do, by query status. Read-only.</small>
        </span>
        <span className={`chev${open ? ' open' : ''}`} aria-hidden="true"><ChevronRight size={16} /></span>
      </button>

      {open && (
        <div className="tp-body">
          <ul className="tp-notes">
            <li>A person's ticket role is set under <b>Users</b> and is separate from their application role.</li>
            <li>Channel Leads act only on queries in their authorized channels.</li>
            <li>Replying to the supplier and resolving are for the query's assignee, so a Channel Lead or Admin must assign it to themselves first.</li>
          </ul>
          {failed && <p className="tp-state">Couldn't load the ticket permissions.</p>}
          {!matrix && !failed && <p className="tp-state">Loading…</p>}
          {matrix && (
            <>
              <div className="table-scroll">
                <table className="tp-table">
                  <thead><tr><th>Action</th>{matrix.roles.map((r) => <th key={r}>{r}</th>)}</tr></thead>
                  <tbody>
                    {matrix.rows.map((row) => (
                      <tr key={row.action}>
                        <td>{row.action}</td>
                        {row.cells.map((cell, i) => (
                          <td key={matrix.roles[i]}>
                            {!cell.text && !cell.ifAssigned && <span className="tp-none">–</span>}
                            {cell.text && <StatusChips text={cell.text} />}
                            {cell.ifAssigned && <StatusChips text={cell.ifAssigned} own />}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="tp-legend"><sup>*</sup> Only when the query is assigned to that person.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
