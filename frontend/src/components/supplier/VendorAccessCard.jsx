import { useEffect, useState } from 'react';
import { supplierAccessApi } from '../../api/suppliersApi';
import { requestTime } from '../modals/SupplierRequestModal.jsx';
import { splitCodes } from '../../pages/SupplierRequestPage.jsx';
import Badge from '../common/Badge.jsx';
import { Key } from '../common/icons.jsx';

const TONE = { Pending: 'amber', Approved: 'green', Rejected: 'red' };

/**
 * On a supplier's profile: ask the Mahindra team to add or remove vendor codes. The note is
 * compulsory, so the reviewer knows why. One request can wait for review at a time.
 */
export default function VendorAccessCard({ codes }) {
  const [latest, setLatest] = useState(undefined);
  const [open, setOpen] = useState(false);
  const [add, setAdd] = useState('');
  const [remove, setRemove] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let stale = false;
    supplierAccessApi.latestRequest()
      .then((r) => { if (!stale) setLatest(r.request); })
      .catch(() => { if (!stale) setLatest(null); });
    return () => { stale = true; };
  }, []);

  const pending = latest?.status === 'Pending';
  const toAdd = splitCodes(add).filter((c) => !codes.some((have) => have.toLowerCase() === c.toLowerCase()));

  async function submit(e) {
    e.preventDefault();
    if (!toAdd.length && !remove.length) { setError('Enter a vendor code to add, or tick one to remove.'); return; }
    if (note.trim().length < 3) { setError('Add a note so the team knows why you need this change.'); return; }
    setBusy(true);
    setError('');
    try {
      const created = await supplierAccessApi.requestChange({ addCodes: toAdd, removeCodes: remove, note: note.trim() });
      setLatest(created);
      setOpen(false);
      setAdd('');
      setRemove([]);
      setNote('');
    } catch (err) {
      setError(err.message || 'Could not send your request. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pf-card wide va-card" aria-label="Vendor code access">
      <header>
        <span className="pf-card-icon" aria-hidden="true"><Key /></span>
        <h3>Vendor code access</h3>
      </header>
      <div className="pf-card-body">
      {latest && (
        <div className={`va-status ${latest.status.toLowerCase()}`}>
          <Badge tone={TONE[latest.status] || 'gray'}>{latest.status === 'Pending' ? 'Waiting for review' : latest.status}</Badge>
          <span>
            Requested {requestTime(latest.createdAt)}
            {latest.addCodes.length > 0 && ` · add ${latest.addCodes.join(', ')}`}
            {latest.removeCodes.length > 0 && ` · remove ${latest.removeCodes.join(', ')}`}
          </span>
        </div>
      )}
      {!open ? (
        <>
          <p className="pf-note">Need invoices for another vendor code, or no longer handle one? Ask the Mahindra team to change your access.</p>
          <button type="button" className="btn primary" onClick={() => setOpen(true)} disabled={pending || latest === undefined}>
            Request a change
          </button>
          {pending && <p className="pf-note va-wait">You can send another request once this one has been reviewed.</p>}
        </>
      ) : (
        <form className="va-form" onSubmit={submit} noValidate>
          {error && <div className="form-error" role="alert">{error}</div>}
          <label className="sr-field">Vendor codes to add
            <input className="search-box" placeholder="Separate with commas" value={add} onChange={(e) => setAdd(e.target.value)} />
          </label>
          {toAdd.length > 0 && <div className="lgn-code-chips">{toAdd.map((c) => <span key={c}>+ {c}</span>)}</div>}
          {codes.length > 0 && (
            <fieldset className="va-remove">
              <legend>Vendor codes to remove</legend>
              {codes.map((c) => (
                <label key={c} className={remove.includes(c) ? 'is-selected' : ''}>
                  <input type="checkbox" checked={remove.includes(c)}
                    onChange={() => setRemove((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))} />
                  {c}
                </label>
              ))}
            </fieldset>
          )}
          <label className="sr-field">Note <small>required</small>
            <textarea className="search-box sr-message" rows={3} maxLength={1000} value={note}
              placeholder="Why you need this change, e.g. we now also supply from our Chennai plant (vendor code …)"
              onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="va-actions">
            <button type="button" className="btn" onClick={() => { setOpen(false); setError(''); }} disabled={busy}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
          </div>
        </form>
      )}
      </div>
    </section>
  );
}
