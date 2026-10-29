import logo from '../../assets/Mahindra Digital Engine.png';

/** Slim corporate header: brand lockup + low-key support links. */
export default function AppHeader() {
  return (
    <header className="lgn-hdr">
      <div className="lgn-hdr-brand">
        <img src={logo} alt="Mahindra Digital Engine" />
        <span>Invoice to Payment Tracker</span>
      </div>
      <nav className="lgn-hdr-nav" aria-label="Support">
        <a href="https://i2p-help.mahindra.internal" target="_blank" rel="noreferrer">Help</a>
        <a href="mailto:i2p-support@mahindra.com?subject=Invoice%20to%20Payment%20Tracker%20support">Contact Support</a>
      </nav>
    </header>
  );
}
