import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { CHANNELS, CHANNEL_LABEL } from '../../data/constants';
import { ensureNavExpanded, setSidebarCollapsed, toggleNavExpanded, toggleSidebarCollapsed } from '../../features/ui/uiSlice';
import { askLogout } from '../../features/auth/logoutPrompt';
import { selectHasTicketAccess, selectPerm } from '../../features/auth/authSlice';
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
      aria-label={label}
      title={label}
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
  const { authType, channelScope } = useSelector((s) => s.auth);
  const perm = useSelector(selectPerm);
  const hasTicketAccess = useSelector(selectHasTicketAccess);
  const expandedNav = useSelector((s) => s.ui.expandedNav);
  const collapsed = useSelector((s) => s.ui.sidebarCollapsed);
  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');
  const isOpen = (id) => expandedNav.includes(id);
  const logout = () => dispatch(askLogout());
  // In the icon-only rail a group's children have nowhere to show, so opening a group
  // widens the sidebar first.
  const toggleGroup = (id) => () => {
    if (collapsed) { dispatch(setSidebarCollapsed(false)); dispatch(ensureNavExpanded(id)); } else dispatch(toggleNavExpanded(id));
  };
  // Always visible (it sits on the sidebar's edge by the logo, not at the end of the scrolling
  // list), so collapsing never needs a scroll.
  const collapseToggle = (
    <button
      type="button"
      className="sidebar-edge-toggle"
      onClick={() => dispatch(toggleSidebarCollapsed())}
      aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
      title={collapsed ? 'Expand menu' : 'Collapse menu'}
      aria-expanded={!collapsed}
    >
      <span style={{ display: 'flex', transform: collapsed ? 'none' : 'rotate(180deg)' }}><ChevronRight size={14} /></span>
    </button>
  );

  // ── Supplier sidebar ──
  if (authType === 'supplier') {
    return (
      <aside className="sidebar">
        <Brand />
        {collapseToggle}
        <div className="sidebar-scroll">
          <nav className="nav-tree" aria-label="Primary">
            <NavItem icon={<FileText />} label="My Invoices" active={isActive('/supplier/home')} onClick={() => navigate('/supplier/home')} />
            <NavItem icon={<History />} label="Logs" active={isActive('/supplier/logs')} onClick={() => navigate('/supplier/logs')} />
            <NavItem icon={<MessageSquare />} label="My Queries" active={isActive('/supplier/tickets')} onClick={() => navigate('/supplier/tickets')} />
            <NavItem icon={<Bell />} label="Notifications" active={isActive('/supplier/notifications')} onClick={() => navigate('/supplier/notifications')} />
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
  const canUseSettings = perm.manageConfig || perm.manageUsers || perm.manageRoles || perm.viewAuditLog;

  return (
    <aside className="sidebar">
      <Brand />
      {collapseToggle}
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

          {isChannelLocked ? (
            // Only one channel to show — a dropdown that expands to itself is just an
            // extra click, so this account's single channel is its own direct link.
            <NavItem
              icon={<Layers />}
              label={channelLabel}
              active={isActive(`/app/channel/${channelScope}`)}
              onClick={() => navigate(`/app/channel/${channelScope}`)}
            />
          ) : (
            <>
              <NavItem
                icon={<Layers />}
                label="Processing Channels"
                hasChildren
                open={isOpen('channels')}
                onClick={toggleGroup('channels')}
              />
              {isOpen('channels') && (
                <div className="nav-children lvl1">
                  {channelsToShow.map((c) => (
                    <NavItem key={c.key} icon={<span className="nav-dot" />} label={c.label} active={isActive(`/app/channel/${c.key}`)} onClick={() => navigate(`/app/channel/${c.key}`)} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* Supplier Visibility and Reports — HQ only */}
          {isHQ && (
            <NavItem icon={<Building />} label="Supplier Visibility" active={isActive('/app/supplier-visibility')} onClick={() => navigate('/app/supplier-visibility')} />
          )}
          {hasTicketAccess && (
            <>
              <NavItem icon={<MessageSquare />} label="Inquiry Desk" active={isActive('/app/inquiry-desk')} onClick={() => navigate('/app/inquiry-desk')} />
              <NavItem icon={<Bell />} label="Notifications" active={isActive('/app/notifications')} onClick={() => navigate('/app/notifications')} />
            </>
          )}
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
                  onClick={toggleGroup('settings')}
                />
              )}
              {canUseSettings && isOpen('settings') && (
                <div className="nav-children lvl1">
                  {perm.manageConfig && <NavItem icon={<Sliders />} label="Integration Settings" active={isActive('/app/settings/integrations')} onClick={() => navigate('/app/settings/integrations')} />}
                  {perm.manageConfig && <NavItem icon={<Bell />} label="Auto-Notify Rules" active={isActive('/app/settings/notifications')} onClick={() => navigate('/app/settings/notifications')} />}
                  {perm.viewAuditLog && <NavItem icon={<History />} label="Audit Logs" active={isActive('/app/settings/auditLogs')} onClick={() => navigate('/app/settings/auditLogs')} />}
                  {perm.manageUsers && <NavItem icon={<Users />} label="Users" active={isActive('/app/settings/users')} onClick={() => navigate('/app/settings/users')} />}
                  {perm.manageRoles && <NavItem icon={<Shield />} label="Roles & Permissions" active={isActive('/app/settings/roles')} onClick={() => navigate('/app/settings/roles')} />}
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
