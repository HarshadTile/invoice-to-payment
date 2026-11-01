import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { suppliersApi } from '../api/suppliersApi';
import { CHANNEL_LABEL } from '../data/constants';
import { selectPerm } from '../features/auth/authSlice';
import { pushToast } from '../features/ui/uiSlice';
import Badge from '../components/common/Badge.jsx';
import ModalShell from '../components/modals/ModalShell.jsx';
import AddSupplierModal from '../components/modals/AddSupplierModal.jsx';
import SupplierEditModal from '../components/modals/SupplierEditModal.jsx';
import SupplierRequestModal, { requestTime } from '../components/modals/SupplierRequestModal.jsx';
import StatCard from '../components/common/StatCard.jsx';
import { Avatar, ExpiryDisclosure, TagList } from '../components/settings/SettingsParts.jsx';
import { Plus, Edit, Trash, Key, Inbox, Users, Mail, Search, CheckCircle, Clock, UserPlus } from '../components/common/icons.jsx';

const TONE = { Active: 'green', Invited: 'amber', Inactive: 'gray' };
const REQUEST_TONE = { Pending: 'amber', Approved: 'green', Rejected: 'red' };
const REQUEST_FILTERS = ['Pending', 'Approved', 'Rejected', ''];

/** Suppliers: create accounts, send access emails, change codes, and deactivate; and review
 *  the access requests suppliers send (new accounts and vendor code changes). */
export default function SuppliersPage() {
  const dispatch = useDispatch();
  const perm = useSelector(selectPerm);
  const role = useSelector((s) => s.auth.role);
  const isAdmin = role === 'Admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'requests' ? 'requests' : 'suppliers';
  const openRequestId = Number(searchParams.get('request')) || null;
  const setParams = (changes) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([k, v]) => { if (v == null || v === '') next.delete(k); else next.set(k, v); });
    setSearchParams(next, { replace: true });
  };

  const [requests, setRequests] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [requestFilter, setRequestFilter] = useState('Pending');
  const [requestsVersion, setRequestsVersion] = useState(0);
  useEffect(() => {
    let stale = false;
    const load = () => suppliersApi.listRequests(requestFilter)
      .then((r) => { if (!stale) { setRequests(r.items || []); setPendingCount(r.pendingCount || 0); } })
      .catch(() => { if (!stale) setRequests((prev) => prev || []); });
    load();
    const poll = setInterval(load, 30000);
    return () => { stale = true; clearInterval(poll); };
  }, [requestFilter, requestsVersion]);

  const [suppliers, setSuppliers] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [adding, setAdding] = useState(false);
  const [editSupplier, setEditSupplier] = useState(null);
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

  const counts = useMemo(() => {
    const c = { all: 0, Active: 0, Invited: 0, Inactive: 0 };
    for (const s of suppliers || []) { c.all += 1; c[s.status] = (c[s.status] || 0) + 1; }
    return c;
  }, [suppliers]);
  const shownSuppliers = (suppliers || []).filter((s) => !statusFilter || s.status === statusFilter);

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

  const showEmailStatus = (result) => {
    const { emailSent, ...updated } = result;
    replace(updated);
    toast(emailSent ? `Access email sent to ${result.email}.` : `Email could not be sent to ${result.email || 'supplier'}. Check SMTP and contact email.`);
  };

  async function remove() {
    const target = pendingDelete;
    await run(target, suppliersApi.deleteSupplier, () => {
      setSuppliers((prev) => prev.filter((s) => s.id !== target.id));
      toast(`${target.name} removed.`);
    });
    setPendingDelete(null);
  }

  function decided(result, outcome) {
    setParams({ request: null });
    setRequestsVersion((v) => v + 1);
    const { request, supplier, emailSent } = result;
    if (supplier) {
      setSuppliers((prev) => ((prev || []).some((s) => s.id === supplier.id)
        ? prev.map((s) => (s.id === supplier.id ? supplier : s))
        : [...(prev || []), supplier]));
    }
    if (outcome === 'rejected') toast(emailSent ? `Request rejected. ${request.email} was emailed the reason.` : 'Request rejected, but the email could not be sent. Check SMTP.');
    else if (request.kind === 'CHANGE_ACCESS') toast(`Vendor codes updated for ${supplier.name}.${emailSent ? ' The supplier was emailed.' : ''}`);
    else toast(emailSent ? `Account created. Setup email sent to ${supplier.email}.` : `Account created, but the setup email could not be sent to ${supplier.email}. Check SMTP and use the key action to retry.`);
  }

  return (
    <div className="dash settings-page">
      <div className="kpi-grid set-kpis four">
        <StatCard tone="shade-total" icon={<Users size={16} />} label="Supplier accounts" value={suppliers ? counts.all : '–'} sub="Accounts on the supplier portal"
          onClick={() => { setParams({ tab: null }); setStatusFilter(''); }} active={tab === 'suppliers' && !statusFilter} />
        <StatCard tone="shade-paid" icon={<CheckCircle size={16} />} label="Active" value={suppliers ? counts.Active : '–'} sub="Signed in with a password"
          onClick={() => { setParams({ tab: null }); setStatusFilter('Active'); }} active={tab === 'suppliers' && statusFilter === 'Active'} />
        <StatCard tone="shade-approved" icon={<Clock size={16} />} label="Invited" value={suppliers ? counts.Invited : '–'} sub="Setup email sent, password not set"
          onClick={() => { setParams({ tab: null }); setStatusFilter('Invited'); }} active={tab === 'suppliers' && statusFilter === 'Invited'} />
        <StatCard tone="shade-pending" icon={<UserPlus size={16} />} label="Pending requests" value={pendingCount} sub={pendingCount ? 'Waiting for your review' : 'Nothing to review'}
          onClick={() => setParams({ tab: 'requests' })} active={tab === 'requests'} />
      </div>
    <div className="card set-card supplier-admin">
      <div className="sm-tabs" role="tablist" aria-label="Supplier management">
        <button type="button" role="tab" aria-selected={tab === 'suppliers'} className={tab === 'suppliers' ? 'active' : ''}
          onClick={() => setParams({ tab: null, request: null })}><Users size={15} />Suppliers</button>
        <button type="button" role="tab" aria-selected={tab === 'requests'} className={tab === 'requests' ? 'active' : ''}
          onClick={() => setParams({ tab: 'requests' })}>
          <Mail size={15} />Access requests{pendingCount > 0 && <span className="sm-tab-count" aria-label={`${pendingCount} pending`}>{pendingCount}</span>}
        </button>
      </div>

      {tab === 'requests' ? (
        <RequestsTab requests={requests} filter={requestFilter} onFilter={setRequestFilter} onOpen={(id) => setParams({ request: id })} />
      ) : (
      <>
      {perm.manageSuppliers && <ExpiryDisclosure accountType="supplier" />}
      <div className="set-toolbar">
        <label className="set-search">
          <Search size={15} />
          <input placeholder="Search suppliers by name, email, PAN or vendor code..." aria-label="Search suppliers"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <span className="set-count">{shownSuppliers.length} account{shownSuppliers.length === 1 ? '' : 's'}{statusFilter ? ` · ${statusFilter}` : ''}</span>
        {perm.manageSuppliers && (
          <button type="button" className="btn primary" onClick={() => setAdding(true)}><Plus />Add Supplier</button>
        )}
      </div>

      {loadError && <div className="form-error" role="alert">Couldn't load suppliers: {loadError}</div>}

      {suppliers === null && !loadError ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', padding: '1.25rem 0' }}>Loading suppliers…</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table set-table">
            <thead>
              <tr>
                <th scope="col">Supplier</th>
                <th scope="col">PAN</th>
                <th scope="col">Vendor codes</th>
                <th scope="col">Channels</th>
                <th scope="col">Status</th>
                <th scope="col">Added by</th>
                <th scope="col" className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
                {shownSuppliers.length === 0 && (
                <tr><td colSpan={7}>
                  <div className="empty-state">
                    <Inbox />
                    <b>No suppliers</b>
                    <span>{search.trim() || statusFilter ? 'Try a different search or filter.' : 'Add a supplier to give them access.'}</span>
                  </div>
                </td></tr>
              )}
              {shownSuppliers.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className="set-person">
                      <Avatar name={s.name} />
                      <span><b>{s.name}</b><small className={s.email ? '' : 'set-missing'}>{s.email || 'No email: cannot sign in'}</small></span>
                    </span>
                  </td>
                  <td className="set-mono">{s.pan || <span className="cell-muted">Not available</span>}</td>
                  <td><TagList items={s.vendorCodes} max={3} /></td>
                  <td><TagList mono={false} items={(s.channels?.length ? s.channels : [s.channel]).map((c) => CHANNEL_LABEL[c] || c)} /></td>
                  <td><Badge tone={TONE[s.status] || 'gray'}>{s.locked ? `${s.status} · locked` : s.status}</Badge></td>
                  <td className="cell-muted">{s.createdBy || '—'}</td>
                  <td className="col-actions">
                    <div className="row-actions">
                      <button type="button" className="kebab" title="Edit supplier details" aria-label={`Edit supplier details for ${s.name}`}
                        onClick={() => setEditSupplier(s)}><Edit /></button>
                      {s.status === 'Invited' ? (
                        <button type="button" className="kebab" title="Send setup email" aria-label={`Send setup email to ${s.name}`}
                          disabled={busyId === s.id || !s.email} onClick={() => run(s, suppliersApi.generateSetupLink, showEmailStatus)}><Key /></button>
                      ) : (
                        <button type="button" className="kebab" title="Send password reset email" aria-label={`Send password reset email to ${s.name}`}
                          disabled={busyId === s.id || s.status === 'Inactive' || !s.email} onClick={() => run(s, suppliersApi.resetSupplierPassword, showEmailStatus)}><Key /></button>
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
      </>
      )}

      {openRequestId && (
        <SupplierRequestModal key={openRequestId} requestId={openRequestId} onClose={() => setParams({ request: null })} onDecided={decided} />
      )}

      {adding && (
        <AddSupplierModal
          onClose={() => setAdding(false)}
          onCreated={(created) => {
            const { emailSent, ...supplier } = created;
            setSuppliers((prev) => [...(prev || []), supplier]);
            setAdding(false);
            toast(emailSent ? `Invitation email sent to ${supplier.email}.` : `Supplier created, but email could not be sent to ${supplier.email}. Check SMTP and use the access action to retry.`);
          }}
        />
      )}

      {editSupplier && (
        <SupplierEditModal
          supplier={editSupplier}
          onClose={() => setEditSupplier(null)}
          onSaved={(updated) => { replace(updated); setEditSupplier(null); toast(`${updated.name} details updated.`); }}
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
            Delete <b>{pendingDelete.name}</b> ({pendingDelete.email || `PAN ${pendingDelete.pan}`})? They lose access immediately. This is for
            mistakes; to pause access, use Deactivate instead.
          </p>
        </ModalShell>
      )}
    </div>
    </div>
  );
}

function RequestsTab({ requests, filter, onFilter, onOpen }) {
  return (
    <>
      <div className="toolbar">
        <div className="toolbar-left sm-filter" role="group" aria-label="Request status">
          {REQUEST_FILTERS.map((f) => (
            <button key={f || 'all'} type="button" className={`sm-chip${filter === f ? ' active' : ''}`} aria-pressed={filter === f} onClick={() => onFilter(f)}>
              {f || 'All'}
            </button>
          ))}
        </div>
        <span className="sm-hint">Suppliers request access from the sign-in page; existing suppliers ask for vendor code changes from their profile.</span>
      </div>
      {requests === null ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', padding: '1.25rem 0' }}>Loading requests…</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Received</th>
                <th scope="col">Type</th>
                <th scope="col">Requested by</th>
                <th scope="col">PAN</th>
                <th scope="col">Vendor codes</th>
                <th scope="col">Note</th>
                <th scope="col">Status</th>
                <th scope="col" className="col-actions">Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 && (
                <tr><td colSpan={8}>
                  <div className="empty-state">
                    <Inbox />
                    <b>No {filter ? filter.toLowerCase() : ''} requests</b>
                    <span>New requests appear here and in your notifications.</span>
                  </div>
                </td></tr>
              )}
              {requests.map((r) => (
                <tr key={r.id}>
                  <td className="cell-muted" style={{ whiteSpace: 'nowrap' }}>{requestTime(r.createdAt)}</td>
                  <td><Badge tone={r.kind === 'CHANGE_ACCESS' ? 'blue' : 'purple'}>{r.kind === 'CHANGE_ACCESS' ? 'Code change' : 'New account'}</Badge></td>
                  <td><b>{r.name}</b><div className="cell-muted">{r.email}</div></td>
                  <td style={{ fontFamily: 'monospace' }}>{r.pan || <span className="cell-muted">—</span>}</td>
                  <td className="cell-muted">
                    {r.kind === 'CHANGE_ACCESS'
                      ? [...r.addCodes.map((c) => `+${c}`), ...r.removeCodes.map((c) => `−${c}`)].join(', ')
                      : r.vendorCodes.join(', ')}
                  </td>
                  <td className="cell-muted sm-note" title={r.note || ''}>{r.note || '—'}</td>
                  <td><Badge tone={REQUEST_TONE[r.status] || 'gray'}>{r.status}</Badge></td>
                  <td className="col-actions">
                    <button type="button" className={`btn${r.status === 'Pending' ? ' primary' : ''}`} onClick={() => onOpen(r.id)}
                      aria-label={`${r.status === 'Pending' ? 'Review' : 'View'} request from ${r.name}`}>
                      {r.status === 'Pending' ? 'Review' : 'View'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
