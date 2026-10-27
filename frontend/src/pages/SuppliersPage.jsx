import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { suppliersApi } from '../api/suppliersApi';
import { CHANNEL_LABEL } from '../data/constants';
import { selectPerm } from '../features/auth/authSlice';
import { pushToast } from '../features/ui/uiSlice';
import Badge from '../components/common/Badge.jsx';
import ModalShell from '../components/modals/ModalShell.jsx';
import AddSupplierModal from '../components/modals/AddSupplierModal.jsx';
import SetupLinkModal from '../components/modals/SetupLinkModal.jsx';
import SupplierCodesModal from '../components/modals/SupplierCodesModal.jsx';
import PasswordLinkExpirySettings from '../components/PasswordLinkExpirySettings.jsx';
import { Plus, Edit, Trash, Key, Inbox } from '../components/common/icons.jsx';

const TONE = { Active: 'green', Invited: 'amber', Inactive: 'gray' };

/** Suppliers: create from the invoice data, share the setup link, change codes, deactivate. */
export default function SuppliersPage() {
  const dispatch = useDispatch();
  const perm = useSelector(selectPerm);
  const role = useSelector((s) => s.auth.role);
  const isAdmin = role === 'Admin';

  const [suppliers, setSuppliers] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [linkFor, setLinkFor] = useState(null); // { supplier, link }
  const [editCodes, setEditCodes] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    const q = search.trim();
    let stale = false;
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      suppliersApi.listSuppliers(q ? { search: q } : {})
        .then((rows) => {
          if (stale) return;
          setSuppliers(rows);
          setLoadError('');
        })
        .catch((err) => {
          if (!stale) setLoadError(err.message);
        });
    };
    const initialLoad = setTimeout(refresh, q ? 250 : 0);
    const poll = setInterval(refresh, 15000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stale = true;
      clearTimeout(initialLoad);
      clearInterval(poll);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [search]);

  const replace = (updated) => setSuppliers((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
  const toast = (msg) => dispatch(pushToast(msg));

  async function run(supplier, action, done) {
    setBusyId(supplier.id);
    try {
      const result = await action(supplier.id);
      done(result);
    } catch (err) {
      toast(err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  const showLink = () => (result) => { replace(result); setLinkFor({ supplier: result, link: result.setupLink }); };

  async function remove() {
    const target = pendingDelete;
    await run(target, suppliersApi.deleteSupplier, () => {
      setSuppliers((prev) => prev.filter((s) => s.id !== target.id));
      toast(`${target.name} removed.`);
    });
    setPendingDelete(null);
  }

  return (
    <div className="card">
      {perm.manageSuppliers && <PasswordLinkExpirySettings accountType="supplier" />}
      <div className="toolbar">
        <div className="toolbar-left">
          <input
            className="search-box" style={{ width: '25rem', maxWidth: '100%' }} placeholder="Search suppliers by name, PAN or vendor code..." aria-label="Search suppliers"
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {perm.manageSuppliers && (
          <div className="toolbar-right">
            <button type="button" className="btn primary" onClick={() => setAdding(true)}><Plus />Add Supplier</button>
          </div>
        )}
      </div>

      {loadError && <div className="form-error" role="alert">Couldn't load suppliers: {loadError}</div>}

      {suppliers === null && !loadError ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', padding: '1.25rem 0' }}>Loading suppliers…</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Supplier</th>
                <th scope="col">PAN</th>
                <th scope="col">Vendor codes</th>
                <th scope="col">Channel</th>
                <th scope="col">Status</th>
                <th scope="col">Added by</th>
                <th scope="col" className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(suppliers || []).length === 0 && (
                <tr><td colSpan={7}>
                  <div className="empty-state">
                    <Inbox />
                    <b>No suppliers</b>
                    <span>{search.trim() ? 'Try a different search.' : 'Add a supplier to give them access.'}</span>
                  </div>
                </td></tr>
              )}
              {(suppliers || []).map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td style={{ fontFamily: 'monospace' }}>{s.pan}</td>
                  <td className="cell-muted">{s.vendorCodes.join(', ')}</td>
                  <td>{CHANNEL_LABEL[s.channel] || s.channel}</td>
                  <td><Badge tone={TONE[s.status] || 'gray'}>{s.locked ? `${s.status} · locked` : s.status}</Badge></td>
                  <td className="cell-muted">{s.createdBy || '—'}</td>
                  <td className="col-actions">
                    <div className="row-actions">
                      <button type="button" className="kebab" title="Edit vendor codes" aria-label={`Edit vendor codes of ${s.name}`}
                        onClick={() => setEditCodes(s)}><Edit /></button>
                      {s.status === 'Invited' ? (
                        <button type="button" className="kebab" title="Generate a new setup link" aria-label={`Generate setup link for ${s.name}`}
                          disabled={busyId === s.id} onClick={() => run(s, suppliersApi.generateSetupLink, showLink())}><Key /></button>
                      ) : (
                        <button type="button" className="kebab" title="Reset password (issues a new setup link)" aria-label={`Reset password of ${s.name}`}
                          disabled={busyId === s.id || s.status === 'Inactive'} onClick={() => run(s, suppliersApi.resetSupplierPassword, showLink())}><Key /></button>
                      )}
                      {s.status === 'Inactive' ? (
                        <button type="button" className="btn" disabled={busyId === s.id} aria-label={`Activate ${s.name}`}
                          onClick={() => run(s, suppliersApi.activateSupplier, (r) => { replace(r); toast(`${s.name} activated.`); })}>Activate</button>
                      ) : (
                        <button type="button" className="btn" disabled={busyId === s.id} aria-label={`Deactivate ${s.name}`}
                          onClick={() => run(s, suppliersApi.deactivateSupplier, (r) => { replace(r); toast(`${s.name} deactivated.`); })}>Deactivate</button>
                      )}
                      {isAdmin && (
                        <button type="button" className="kebab" title="Delete supplier" aria-label={`Delete ${s.name}`}
                          onClick={() => setPendingDelete(s)}><Trash /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <AddSupplierModal
          onClose={() => setAdding(false)}
          onCreated={(created) => {
            setSuppliers((prev) => [...(prev || []), created]);
            setAdding(false);
            setLinkFor({ supplier: created, link: created.setupLink });
          }}
        />
      )}

      {linkFor && <SetupLinkModal supplier={linkFor.supplier} link={linkFor.link} onClose={() => setLinkFor(null)} />}

      {editCodes && (
        <SupplierCodesModal
          supplier={editCodes}
          onClose={() => setEditCodes(null)}
          onSaved={(updated) => { replace(updated); setEditCodes(null); toast(`${updated.name} vendor codes updated.`); }}
        />
      )}

      {pendingDelete && (
        <ModalShell
          title="Delete Supplier"
          width={440}
          onClose={() => setPendingDelete(null)}
          foot={(
            <>
              <button type="button" className="btn" onClick={() => setPendingDelete(null)}>Cancel</button>
              <button type="button" className="btn danger" onClick={remove}>Delete</button>
            </>
          )}
        >
          <p className="modal-copy">
            Delete <b>{pendingDelete.name}</b> (PAN {pendingDelete.pan})? They lose access immediately. This is for
            mistakes; to pause access, use Deactivate instead.
          </p>
        </ModalShell>
      )}
    </div>
  );
}
