import logo from '../../assets/mahindra-logo.png';

/** Slim corporate header: brand lockup + low-key support links. */
export default function AppHeader({ onNotify }) {
  return (
    <header className="lgn-hdr">
      <div className="lgn-hdr-brand">
        <img src={logo} alt="Mahindra" />
        <span>Invoice to Payment Tracker</span>
      </div>
      <nav className="lgn-hdr-nav" aria-label="Support">
        <button type="button" onClick={() => onNotify('Help centre: i2p-help.mahindra.internal')}>Help</button>
        <button type="button" onClick={() => onNotify('Contact support: i2p-support@mahindra.com')}>Contact Support</button>
      </nav>
    </header>
  );
}
