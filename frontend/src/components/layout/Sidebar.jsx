import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { CHANNELS, CHANNEL_LABEL } from '../../data/constants';
import { toggleNavExpanded } from '../../features/ui/uiSlice';
import { askLogout } from '../../features/auth/logoutPrompt';
import { selectPerm } from '../../features/auth/authSlice';
import {
  FileText, Search, Layers, Building, MessageSquare, BarChart3, History,
  RefreshCw, Settings, Sliders, Users, Shield, Bell, User, LogOut, ChevronRight,
} from '../common/icons.jsx';
import logo from '../../assets/mahindra-logo.png';

function NavItem({ icon, label, active, badge, onClick, hasChildren, open }) {
  return (
    <button
      type="button"
      className={`nav-item${active ? ' active' : ''}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      <span className="ic" aria-hidden="true">{icon}</span>
      <span className="nav-label">{label}{badge != null ? ` (${badge})` : ''}</span>
      {hasChildren && <span className={`chev${open ? ' open' : ''}`} aria-hidden="true"><ChevronRight size={14} /></span>}
    </button>
  );
}

export default function Sidebar() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { authType, channelScope, supplierLoginVcode } = useSelector((s) => s.auth);
  const perm = useSelector(selectPerm);
  const expandedNav = useSelector((s) => s.ui.expandedNav);
  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');
  const isOpen = (id) => expandedNav.includes(id);
  const logout = () => dispatch(askLogout());

  // ── Supplier sidebar ──
  if (authType === 'supplier') {
    const code = supplierLoginVcode;
    return (
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-scroll">
          <nav className="nav-tree" aria-label="Primary">
            <NavItem icon={<FileText />} label="My Invoices" active={isActive('/supplier/home')} onClick={() => navigate('/supplier/home')} />
            <NavItem icon={<Building />} label="Supplier Visibility" active={isActive('/supplier/vendor-code')} onClick={() => navigate(`/supplier/vendor-code/${code}`)} />
            <NavItem icon={<History />} label="Logs" active={isActive('/supplier/logs')} onClick={() => navigate('/supplier/logs')} />
            <NavItem icon={<MessageSquare />} label="My Queries" active={isActive('/supplier/tickets')} onClick={() => navigate('/supplier/tickets')} />
          </nav>
          <div className="nav-bottom">
            <NavItem icon={<User />} label="My Profile" active={isActive('/supplier/profile')} onClick={() => navigate('/supplier/profile')} />
            <NavItem icon={<LogOut />} label="Logout" onClick={logout} />
          </div>
        </div>
      </aside>
    );
  }

  // ── Internal sidebar ──
  const isHQ = channelScope === 'all';
  const isChannelLocked = !isHQ; // msetuSrm | poPortal | mfoxPortal

  // Channel-locked: show only that one channel. HQ: show all 4.
  const channelsToShow = isChannelLocked
    ? CHANNELS.filter((c) => c.key === channelScope)
    : CHANNELS;

  const channelLabel = CHANNEL_LABEL[channelScope] || channelScope;
  const canUseSettings = perm.manageConfig || perm.manageUsers;

  return (
    <aside className="sidebar">
      <Brand />
      <div className="sidebar-scroll">
        <nav className="nav-tree" aria-label="Primary">
          <p className="nav-section">Overview</p>
          <NavItem
            icon={<FileText />}
            label={isChannelLocked ? `${channelLabel} Invoice Tracking` : 'Invoice Tracking'}
            active={isActive('/app/invoices')}
            onClick={() => navigate('/app/invoices')}
          />
          <NavItem icon={<Search />} label="Search Invoice(s)" active={isActive('/app/search')} onClick={() => navigate('/app/search')} />

          <NavItem
            icon={<Layers />}
            label={isChannelLocked ? `${channelLabel} : Processing` : 'Processing Channels'}
            hasChildren
            open={isOpen('channels')}
            onClick={() => dispatch(toggleNavExpanded('channels'))}
          />
          {isOpen('channels') && (
            <div className="nav-children lvl1">
              {channelsToShow.map((c) => (
                <NavItem key={c.key} icon={<span className="nav-dot" />} label={c.label} active={isActive(`/app/channel/${c.key}`)} onClick={() => navigate(`/app/channel/${c.key}`)} />
              ))}
            </div>
          )}

          {/* Supplier Visibility and Reports — HQ only */}
          {isHQ && (
            <NavItem icon={<Building />} label="Supplier Visibility" active={isActive('/app/supplier-visibility')} onClick={() => navigate('/app/supplier-visibility')} />
          )}
          <NavItem icon={<MessageSquare />} label="Inquiry Desk" active={isActive('/app/inquiry-desk')} onClick={() => navigate('/app/inquiry-desk')} />
        </nav>

        <div className="nav-bottom">
          {isHQ && (
            <>
              <p className="nav-section">Reports &amp; admin</p>
              <NavItem icon={<BarChart3 />} label="Vendor Status Reports" active={isActive('/app/outputs')} onClick={() => navigate('/app/outputs')} />
              <NavItem icon={<History />} label="Logs / History" active={isActive('/app/logs')} onClick={() => navigate('/app/logs')} />
              <NavItem icon={<RefreshCw />} label="Sync Log" active={isActive('/app/sync-log')} onClick={() => navigate('/app/sync-log')} />
              {canUseSettings && (
                <NavItem
                  icon={<Settings />}
                  label="Settings"
                  hasChildren
                  open={isOpen('settings')}
                  onClick={() => dispatch(toggleNavExpanded('settings'))}
                />
              )}
              {canUseSettings && isOpen('settings') && (
                <div className="nav-children lvl1">
                  {perm.manageConfig && <NavItem icon={<Sliders />} label="Integration Settings" active={isActive('/app/settings/integrations')} onClick={() => navigate('/app/settings/integrations')} />}
                  {perm.manageConfig && <NavItem icon={<Bell />} label="Notifications" active={isActive('/app/settings/notifications')} onClick={() => navigate('/app/settings/notifications')} />}
                  <NavItem icon={<History />} label="Audit Logs" active={isActive('/app/settings/auditLogs')} onClick={() => navigate('/app/settings/auditLogs')} />
                  {perm.manageUsers && <NavItem icon={<Users />} label="Users" active={isActive('/app/settings/users')} onClick={() => navigate('/app/settings/users')} />}
                  {perm.manageUsers && <NavItem icon={<Shield />} label="Roles & Permissions" active={isActive('/app/settings/roles')} onClick={() => navigate('/app/settings/roles')} />}
                </div>
              )}
            </>
          )}
          <NavItem icon={<User />} label="Profile" active={isActive('/app/profile')} onClick={() => navigate('/app/profile')} />
          <NavItem icon={<LogOut />} label="Logout" onClick={logout} />
        </div>
      </div>
    </aside>
  );
}

function Brand() {
  return (
    <div className="brand">
      <img src={logo} alt="Mahindra" />
    </div>
  );
}
