import { useEffect, useState } from 'react';
import { suppliersApi } from '../../api/suppliersApi';
import ModalShell from './ModalShell.jsx';

/** Change which vendor codes a supplier can see. The choices are the codes the invoice data lists for its PAN. */
export default function SupplierCodesModal({ supplier, onClose, onSaved }) {
  const [options, setOptions] = useState(supplier.vendorCodes);
  const [codes, setCodes] = useState(supplier.vendorCodes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    suppliersApi.searchVendors(supplier.pan).then((found) => {
      const match = found.find((f) => f.pan === supplier.pan);
      if (match) setOptions(match.vendorCodes);
    }).catch(() => {});
  }, [supplier.pan]);

  const toggle = (code) => {
    const next = codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code];
    setCodes(next);
    if (next.length) setError('');
  };

  async function save() {
    if (!codes.length) { setError('Tick at least one vendor code.'); return; }
    setError('');
    setBusy(true);
    try {
      onSaved(await suppliersApi.updateSupplierVendorCodes(supplier.id, codes));
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title={`Vendor codes: ${supplier.name}`}
      width={480}
      className="supplier-codes-modal"
      onClose={busy ? () => {} : onClose}
      foot={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </>
      )}
    >
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="codes-modal-recipient">
        <div className="codes-modal-avatar" aria-hidden="true">{supplier.name.trim().charAt(0).toUpperCase()}</div>
        <div className="codes-modal-recipient-copy">
          <span>SUPPLIER</span>
          <strong>{supplier.name}</strong>
          <small>PAN <b>{supplier.pan}</b></small>
        </div>
      </div>
      <div className="codes-modal-section-heading">
        <div><strong>Vendor code access</strong><span>Choose which codes this supplier can access.</span></div>
        <span className="codes-modal-count">{codes.length} of {options.length}</span>
      </div>
      <div className="codes-modal-options">
        {options.map((code) => (
          <label key={code} className={`supplier-code-option${codes.includes(code) ? ' is-selected' : ''}`}>
            <input type="checkbox" checked={codes.includes(code)} onChange={() => toggle(code)} />
            <span className="supplier-code-check" aria-hidden="true" />
            <span className="supplier-code-text">{code}</span>
            <span className="supplier-code-state">{codes.includes(code) ? 'Included' : 'Excluded'}</span>
          </label>
        ))}
      </div>
    </ModalShell>
  );
}
