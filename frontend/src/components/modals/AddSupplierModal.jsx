import { useEffect, useState } from 'react';
import { suppliersApi } from '../../api/suppliersApi';
import ModalShell from './ModalShell.jsx';

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
  const [codes, setCodes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
    setCodes(entry.vendorCodes);
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
    setError('');
    setBusy(true);
    try {
      const created = await suppliersApi.addSupplier({
        pan: picked.pan, vendorCodes: codes,
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
          <button type="button" className="btn primary" onClick={create} disabled={busy || !picked}>
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
                key={r.pan} type="button" className="btn" disabled={r.alreadyRegistered}
                style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '0.375rem' }}
                onClick={() => pick(r)}
              >
                <b>{r.name}</b> · <span style={{ fontFamily: 'monospace' }}>{r.pan}</span>
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {r.vendorCodes.join(', ')}{r.alreadyRegistered ? ' — already registered' : ''}
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
              <span className="supplier-pan">PAN <b>{picked.pan}</b></span>
            </div>
            <button type="button" className="supplier-change" onClick={() => { setPicked(null); setError(''); }}>Change</button>
          </div>
          <fieldset className="supplier-codes-fieldset">
            <legend className="supplier-codes-heading">Vendor code access <span>{codes.length} selected</span></legend>
            <p className="supplier-codes-help">This supplier will only see invoices and updates for the selected codes.</p>
            {picked.vendorCodes.map((code) => (
              <label key={code} className={`supplier-code-option${codes.includes(code) ? ' is-selected' : ''}`}>
                <input type="checkbox" aria-label={code} checked={codes.includes(code)} onChange={() => toggle(code)} />
                <span className="supplier-code-check" aria-hidden="true" />
                <span className="supplier-code-text">{code}</span>
                <span className="supplier-code-state">{codes.includes(code) ? 'Included' : 'Excluded'}</span>
              </label>
            ))}
          </fieldset>
        </>
      )}
    </ModalShell>
  );
}
