import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { suppliersApi } from '../../api/suppliersApi';
import ModalShell from './ModalShell.jsx';
import VendorCodeOption, { useCodeOwner } from '../supplier/VendorCodeOption.jsx';

/**
 * Find a vendor in the invoice data (by supplier name, PAN or vendor code, partial text is fine),
 * tick the vendor codes the supplier may see, and create the account. The server assigns the
 * supplier's channel.
 */
export default function AddSupplierModal({ onClose, onCreated }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(null);
  const [email, setEmail] = useState('');
  const [codes, setCodes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ownerOf = useCodeOwner(picked?.codeChannels);
  const { role, channelScope, allowedChannels } = useSelector((st) => st.auth);
  const isAdmin = role === 'Admin';
  const myChannels = new Set([...(allowedChannels || []), ...(channelScope && channelScope !== 'all' ? [channelScope] : [])]);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  useEffect(() => {
    const q = query.trim();
    if (!q) return undefined;
    let stale = false;
    const timer = setTimeout(() => {
      setSearching(true);
      suppliersApi.searchVendors(q)
        .then((found) => { if (!stale) setResults(found); })
        .catch((err) => { if (!stale) setError(err.message); })
        .finally(() => { if (!stale) setSearching(false); });
    }, 250);
    return () => { stale = true; clearTimeout(timer); };
  }, [query]);

  function pick(entry) {
    setPicked(entry);
    // Tick the codes this person may give; another team's codes stay unticked and read-only.
    const owner = (code) => {
      const channels = (entry.codeChannels || {})[code] || [];
      return channels.length && !channels.some((c) => myChannels.has(c));
    };
    setCodes(isAdmin ? entry.vendorCodes : entry.vendorCodes.filter((code) => !owner(code)));
    setError('');
  }

  function toggle(code) {
    const isSelected = codes.includes(code);
    setCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
    if (!isSelected && error === 'Tick at least one vendor code.') setError('');
  }
  const shownResults = query.trim() ? results : [];

  async function create() {
    if (!picked) { setError('Search and pick a supplier first.'); return; }
    if (!codes.length) { setError('Tick at least one vendor code.'); return; }
    if (!emailValid) { setError('Enter a valid supplier contact email.'); return; }
    setError('');
    setBusy(true);
    try {
      const created = await suppliersApi.addSupplier({
        pan: picked.pan || null, email: email.trim(), vendorCodes: codes,
      });
      onCreated(created);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title="Add Supplier"
      width={620}
      className="add-supplier-modal"
      onClose={busy ? () => {} : onClose}
      foot={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn primary" onClick={create} disabled={busy || !picked || !emailValid || !codes.length}>
            {busy ? 'Creating…' : 'Create supplier'}
          </button>
        </>
      )}
    >
      {error && <div className="form-error" role="alert">{error}</div>}

      {!picked ? (
        <>
          <div className="supplier-search-intro">
            <span className="supplier-step-label">SUPPLIER ACCESS</span>
            <p>Find a supplier from your invoice data to set up their account.</p>
          </div>
          <input
            className="search-box supplier-search-input" autoFocus
            aria-label="Search supplier name, PAN or vendor code"
            placeholder="Search by name, PAN or vendor code"
            value={query} onChange={(e) => { setQuery(e.target.value); setSearching(Boolean(e.target.value.trim())); }}
          />
          <div style={{ marginTop: '0.75rem', maxHeight: '17.5rem', overflowY: 'auto' }}>
            {searching && <p className="modal-copy">Searching…</p>}
            {!searching && query.trim() && shownResults.length === 0 && <p className="modal-copy">No vendor matches “{query.trim()}”.</p>}
            {shownResults.map((r) => (
              <button
                key={r.pan || r.vendorCodes[0]} type="button" className="btn"
                style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '0.375rem' }}
                onClick={() => pick(r)}
              >
                <b>{r.name}</b> · <span style={{ fontFamily: 'monospace' }}>{r.pan || 'No PAN'}</span>
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {r.vendorCodes.join(', ')}
                  {r.accounts > 0 && ` · already has ${r.accounts} account${r.accounts === 1 ? '' : 's'} (another location can have its own, with a different email)`}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="supplier-identity-card">
            <div className="supplier-avatar" aria-hidden="true">{picked.name.trim().charAt(0).toUpperCase()}</div>
            <div className="supplier-identity-copy">
              <span className="supplier-step-label">SUPPLIER</span>
              <strong>{picked.name}</strong>
              <span className="supplier-pan">PAN <b>{picked.pan || 'not available'}</b></span>
            </div>
            <button type="button" className="supplier-change" onClick={() => { setPicked(null); setError(''); }}>Change</button>
          </div>
          <div className="supplier-contact-field">
            <label className="supplier-contact-label" htmlFor="supplier-contact-email">
              Contact email <span>Required</span>
            </label>
            <input
              id="supplier-contact-email" className="supplier-contact-input" type="email" required
              autoComplete="email" aria-describedby="supplier-contact-email-help"
              aria-invalid={!!email && !emailValid}
              placeholder="supplier@example.com"
              value={email} onChange={(event) => setEmail(event.target.value)}
            />
            <small id="supplier-contact-email-help" className="supplier-contact-help">
              This is the supplier's sign-in. Setup and password reset emails go here; each account needs its own email.
            </small>
            {!!email.trim() && !emailValid && <small className="supplier-contact-error">Enter a valid email address.</small>}
          </div>
          <fieldset className="supplier-codes-fieldset">
            <legend className="supplier-codes-heading">Vendor code access <span>{codes.length} selected</span></legend>
            <p className="supplier-codes-help">This supplier will only see invoices and updates for the selected codes.</p>
            {picked.vendorCodes.map((code) => (
              <VendorCodeOption key={code} code={code} checked={codes.includes(code)} onToggle={() => toggle(code)} owner={ownerOf(code)} />
            ))}
          </fieldset>
        </>
      )}
    </ModalShell>
  );
}
