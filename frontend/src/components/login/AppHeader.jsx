import logo from '../../assets/mahindra-digital-engine.png';
import { useLocation } from 'react-router-dom';
import { SUPPORT_EMAIL } from './support';
import { useState, useRef, useEffect } from 'react';

/** Help opens the supplier manual on supplier pages (the sign-in page defaults to the supplier
 *  form), otherwise the internal (HQ) manual. */
export function helpManual({ pathname, search }) {
  const account = new URLSearchParams(search).get('account');
  const supplier = pathname.startsWith('/supplier') || account === 'supplier' || (pathname === '/login' && account !== 'internal');
  return supplier ? '/user-manual/vendor-view.pdf' : '/user-manual/all-channels-hq.pdf';
}

/** Get the URL for a specific manual by type */
export function getLoginManualUrl(accountType, manualType) {
  const manualMap = {
    'all-channels': 'all-channels-hq.pdf',
    'po-portal': 'po-portal.pdf',
    'msetu-srm': 'msetu-srm.pdf',
    'supplier': 'vendor-view.pdf',
  };
  const filename = manualMap[manualType] || 'all-channels-hq.pdf';
  return `/user-manual/${filename}`;
}

/** Help dropdown for login page: let users choose which manual to view */
function LoginHelpDropdown({ accountType }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const isSupplier = accountType === 'supplier';

  const options = isSupplier
    ? [{ value: 'supplier', label: 'Supplier' }]
    : [
        { value: 'all-channels', label: 'All Channels' },
        { value: 'po-portal', label: 'HQ/PO Portal' },
        { value: 'msetu-srm', label: 'Msetu/SRM' },
      ];

  function openManual(manualType) {
    const url = getLoginManualUrl(accountType, manualType);
    window.open(url, '_blank', 'noreferrer');
    setOpen(false);
  }

  // Close on click outside
  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close on Escape key
  useEffect(() => {
    function handler(e) {
      if (e.key === 'Escape' && open) setOpen(false);
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <div ref={wrapRef} className="lgn-help-dropdown">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="lgn-help-btn"
        aria-label="Help: select and open user manual"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="User manual"
      >
        Help
      </button>

      {open && (
        <div className="lgn-help-menu">
          <div className="lgn-help-list" role="listbox">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                onClick={() => openManual(opt.value)}
                className="lgn-help-opt"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Slim corporate header: brand lockup + Help (the user manual) and Contact Us (an email to the helpdesk).
 *  The lockup matches the app's sidebar: the red emblem from the logo with the name set as bold text. */
export default function AppHeader() {
  const location = useLocation();
  const accountType = new URLSearchParams(location.search).get('account') === 'internal' ? 'internal' : 'supplier';

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
        <LoginHelpDropdown accountType={accountType} />
        <a href={`mailto:${SUPPORT_EMAIL}?subject=Invoice%20Tracker%20support`}>Contact Us</a>
      </nav>
    </header>
  );
}
