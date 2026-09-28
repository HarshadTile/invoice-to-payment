/** Minimal legal line for the auth card. Help / Contact Support already live in
 *  the header, so this stays to just copyright + non-routed policy affordances. */
export default function SupportFooter({ onNotify }) {
  return (
    <div className="lgn-legal">
      <span>© 2026 Mahindra</span>
      <button type="button" onClick={() => onNotify('Privacy policy — see the Mahindra intranet.')}>Privacy</button>
      <button type="button" onClick={() => onNotify('Terms of use — see the Mahindra intranet.')}>Terms</button>
      <button type="button" className="lgn-legal-help"
        onClick={() => onNotify('Contact support: i2p-support@mahindra.com')}>Need help?</button>
    </div>
  );
}
