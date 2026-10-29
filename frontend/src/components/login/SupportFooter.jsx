import { useState } from 'react';
import ModalShell from '../modals/ModalShell.jsx';

const SUPPORT_EMAIL = 'i2p-support@mahindra.com';

/** Policy notices and support links shown on authentication screens. */
export default function SupportFooter() {
  const [policy, setPolicy] = useState(null);
  const policyContent = policy === 'Privacy'
    ? 'This application uses account details, supplier access settings, and activity records to support invoice processing and protect access. For the complete Mahindra privacy policy or questions about your information, contact the support team.'
    : 'Use this application only for authorized invoice, supplier, and payment workflows. Keep your password and account setup links private, and use the access assigned to your role. For the complete Mahindra terms of use, contact the support team.';
  return (
    <>
      <div className="lgn-legal">
        <span>© 2026 Mahindra</span>
        <button type="button" onClick={() => setPolicy('Privacy')}>Privacy</button>
        <button type="button" onClick={() => setPolicy('Terms')}>Terms</button>
        <a className="lgn-legal-help" href={`mailto:${SUPPORT_EMAIL}?subject=Invoice%20to%20Payment%20Tracker%20help`}>Need help?</a>
      </div>
      {policy && (
        <ModalShell title={`${policy} notice`} width={520} onClose={() => setPolicy(null)}
          foot={<a className="btn btn-primary" href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Request for Mahindra ${policy.toLowerCase()} policy`)}`}>Contact support</a>}>
          <p className="modal-copy">{policyContent}</p>
        </ModalShell>
      )}
    </>
  );
}
