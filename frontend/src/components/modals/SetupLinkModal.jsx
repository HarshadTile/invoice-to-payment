import { useState } from 'react';
import ModalShell from './ModalShell.jsx';

/** Shows a supplier's one-time setup link so the team can copy it and share it by hand. */
export default function SetupLinkModal({ supplier, link, onClose }) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const shareMessage = `Hello ${supplier.name},\n\nYour Mahindra Supplier Portal access is ready.\n\n1. Open the secure link below.\n2. Confirm your PAN and create a password.\n3. Sign in using your PAN and password.\n\n${link}\n\nFor your security, this link is valid for 7 days from issue and can be used once. If it expires or you need help, please contact your Mahindra representative.\n\nRegards,\nMahindra Invoice to Payment Support`;

  async function copyText(value, fieldId, setCopied) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      const field = document.getElementById(fieldId);
      field?.focus();
      field?.select(); // clipboard blocked: let them copy by hand
    }
  }

  const copyLink = () => copyText(link, 'setup-link-field', setCopiedLink);
  const copyMessage = () => copyText(shareMessage, 'setup-message-field', setCopiedMessage);

  return (
    <ModalShell
      title={`Setup link: ${supplier.name}`}
      width={560}
      className="setup-link-modal"
      onClose={onClose}
      foot={(
        <>
          <button type="button" className="btn" onClick={onClose}>Done</button>
          <button type="button" className="btn primary setup-copy-button" onClick={copyMessage}>
            <span aria-hidden="true">{copiedMessage ? '✓' : '▢'}</span>{copiedMessage ? 'Message copied' : 'Copy supplier message'}
          </button>
        </>
      )}
    >
      <div className="setup-link-recipient">
        <div className="setup-link-avatar" aria-hidden="true">{supplier.name.trim().charAt(0).toUpperCase()}</div>
        <div className="setup-link-recipient-copy">
          <span className="supplier-step-label">ACCOUNT SETUP FOR</span>
          <strong>{supplier.name}</strong>
          <span className="supplier-pan">PAN <b>{supplier.pan}</b></span>
        </div>
        <span className="setup-link-status"><i /> Ready to share</span>
      </div>
      <div className="setup-link-instructions">
        <span className="setup-link-icon" aria-hidden="true">↗</span>
        <p>Share this secure link with the supplier. They’ll confirm their PAN and choose a password to activate their account.</p>
      </div>
      <label className="setup-link-label" htmlFor="setup-link-field">One-time setup link</label>
      <div className="setup-link-field-wrap">
        <input id="setup-link-field" className="setup-link-field" readOnly value={link}
          aria-label="Setup link" onFocus={(e) => e.target.select()} />
        <button type="button" className="setup-inline-copy" onClick={copyLink} aria-label={copiedLink ? 'Link copied' : 'Copy setup link'}>
          {copiedLink ? '✓' : '▢'}
        </button>
      </div>
      <div className="setup-link-expiry"><span aria-hidden="true">◷</span> Valid for 7 days <b>·</b> Can be used once <b>·</b> A new link replaces this one</div>
      <section className="setup-message-card" aria-label="Message to share with supplier">
        <div className="setup-message-head">
          <div><span className="supplier-step-label">READY-TO-SEND MESSAGE</span><strong>Share the link with clear instructions</strong></div>
          <button type="button" onClick={copyMessage}>{copiedMessage ? 'Copied' : 'Copy message'}</button>
        </div>
        <textarea
          id="setup-message-field"
          className="setup-message-text"
          aria-label="Ready-to-send supplier message"
          readOnly
          value={shareMessage}
          onFocus={(e) => e.target.select()}
          rows={5}
        />
      </section>
    </ModalShell>
  );
}
