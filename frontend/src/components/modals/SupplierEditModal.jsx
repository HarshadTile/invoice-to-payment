import { useEffect, useState } from 'react';
import { suppliersApi } from '../../api/suppliersApi';
import ModalShell from './ModalShell.jsx';

/** Edit supplier email and permitted vendor codes together. */
export default function SupplierEditModal({ supplier, onClose, onSaved }) {
  const [options, setOptions] = useState(supplier.vendorCodes);
  const [codes, setCodes] = useState(supplier.vendorCodes);
  const [email, setEmail] = useState(supplier.email || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  useEffect(() => {
    suppliersApi.searchVendors(supplier.pan).then((found) => {
      const match = found.find((item) => item.pan === supplier.pan);
      if (match) setOptions(match.vendorCodes);
    }).catch(() => {});
  }, [supplier.pan]);

  function toggle(code) {
    setCodes((current) => current.includes(code)
      ? current.filter((item) => item !== code)
      : [...current, code]);
    setError('');
  }

  async function save() {
    if (!emailValid) { setError('Enter a valid contact email.'); return; }
    if (!codes.length) { setError('Select at least one vendor code.'); return; }
    setError('');
    setBusy(true);
    try {
      let updated = supplier;
      if (email.trim().toLowerCase() !== (supplier.email || '').toLowerCase()) {
        updated = await suppliersApi.updateSupplierEmail(supplier.id, email.trim());
      }
      if (codes.length !== supplier.vendorCodes.length || codes.some((code) => !supplier.vendorCodes.includes(code))) {
        updated = await suppliersApi.updateSupplierVendorCodes(supplier.id, codes);
      }
      onSaved(updated);
    } catch (err) {
      setError(err.message || 'Could not save supplier details. Please try again.');
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title="Edit supplier details"
      width={560}
      className="supplier-edit-modal"
      onClose={busy ? () => {} : onClose}
      foot={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn primary" onClick={save} disabled={busy || !emailValid || !codes.length}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
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

      <div className="supplier-contact-field">
        <label className="supplier-contact-label" htmlFor="edit-supplier-email">
          Contact email <span>Required</span>
        </label>
        <input
          id="edit-supplier-email"
          className="supplier-contact-input"
          type="email"
          autoComplete="email"
          value={email}
          aria-invalid={!!email && !emailValid}
          aria-describedby="edit-supplier-email-help"
          onChange={(event) => setEmail(event.target.value)}
        />
        <small id="edit-supplier-email-help" className="supplier-contact-help">
          Setup and password reset emails will be sent here.
        </small>
      </div>

      <div className="codes-modal-section-heading">
        <div><strong>Vendor code access</strong><span>Select the codes this supplier can access.</span></div>
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
