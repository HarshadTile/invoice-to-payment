import logo from '../../assets/mahindra-digital-engine.png';
import { useLocation } from 'react-router-dom';
import { SUPPORT_EMAIL } from './support';
import { SUPPLIER_MANUAL_URL } from '../../utils/manuals';

/** The supplier manual is the only public one (its screenshots hold dummy data). Staff manuals show
 *  real screens, so they open only after signing in (Help in the top bar). On the internal sign-in
 *  tab there is no Help link, only Contact Us. */
export function helpManual({ pathname, search }) {
  const account = new URLSearchParams(search).get('account');
  const supplier = pathname.startsWith('/supplier') || account === 'supplier' || (pathname === '/login' && account !== 'internal');
  return supplier ? SUPPLIER_MANUAL_URL : null;
}

/** Slim corporate header: brand lockup + Help (the user manual) and Contact Us (an email to the helpdesk).
 *  The lockup matches the app's sidebar: the red emblem from the logo with the name set as bold text. */
export default function AppHeader() {
  const location = useLocation();
  const manual = helpManual(location);

  return (
    <header className="lgn-hdr">
      <div className="lgn-hdr-brand">
        <span className="lgn-logo" role="img" aria-label="Mahindra Digital Engine">
          <img className="lgn-logo-emblem" src={logo} alt="" />
          <span className="lgn-logo-text" aria-hidden="true">
            <b>mahindra</b>
            <small>DIGITAL ENGINE</small>
          </span>
        </span>
        <span className="lgn-hdr-title">Invoice to Payment Tracker</span>
      </div>
      <nav className="lgn-hdr-nav" aria-label="Support">
        {manual && (
          <a href={manual} target="_blank" rel="noreferrer" title="Supplier user manual" aria-label="Help: open the supplier user manual">Help</a>
        )}
        <a href={`mailto:${SUPPORT_EMAIL}?subject=Invoice%20Tracker%20support`}>Contact Us</a>
      </nav>
    </header>
  );
}
