import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { askLogout } from '../../features/auth/logoutPrompt';
import { User, LogOut } from '../common/icons.jsx';
import { selectScopedInvoices } from '../../features/invoices/selectors';

/** Avatar button in the top bar that opens an account menu: who is signed in,
 *  their email and role, a link to the profile page, and Logout. */
export default function UserMenu() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { authType, channelScope, role, currentUser, supplierQuery, supplierLoginVcode } = useSelector((s) => s.auth);
  // the menu is open for the path it was opened on, so any navigation closes it
  const [openOn, setOpenOn] = useState(null);
  const open = openOn === pathname;
  const setOpen = (v) => setOpenOn(v ? pathname : null);
  const wrapRef = useRef(null);

  const isSupplier = authType === 'supplier';
  const invoices = useSelector((s) => s.auth.authType === 'supplier' ? selectScopedInvoices(s) : []);
  const realName = invoices.find(i => i.vcode === supplierLoginVcode)?.vendor;
  const name = isSupplier ? (realName || supplierQuery) : currentUser.name;
  const email = isSupplier ? '' : currentUser.email;
  const initials = isSupplier ? null : currentUser.initials;
  const detail = isSupplier
    ? `Supplier · ${supplierLoginVcode}`
    : `${role} · ${channelScope === 'all' ? 'All Channels' : 'Internal Team'}`;

  // close on outside click or Escape
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpenOn(null); };
    const onKey = (e) => { if (e.key === 'Escape') setOpenOn(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="user-menu-wrap" ref={wrapRef}>
      <button type="button" className="avatar" aria-label={`Account menu for ${name}`}
        aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {isSupplier ? <User size={18} /> : initials}
      </button>

      {open && (
        <div className="user-menu" role="menu">
          <div className="user-menu-head">
            {!isSupplier && <div className="avatar user-menu-avatar" aria-hidden="true">{initials}</div>}
            <div className="user-menu-who">
              <b>{name}</b>
              {email && <span className="user-menu-email">{email}</span>}
              <span className="chip gray">{detail}</span>
            </div>
          </div>
          <button type="button" role="menuitem" className="user-menu-item"
            onClick={() => navigate(isSupplier ? '/supplier/profile' : '/app/profile')}>
            <User size={16} />Profile
          </button>
          <button type="button" role="menuitem" className="user-menu-item danger"
            onClick={() => { setOpen(false); dispatch(askLogout()); }}>
            <LogOut size={16} />Logout
          </button>
        </div>
      )}
    </div>
  );
}
