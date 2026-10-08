import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Navigate, Outlet } from 'react-router-dom';
import { AUTH_BYPASS, selectPerm } from '../features/auth/authSlice';
import { pushToast } from '../features/ui/uiSlice';

function PortalRedirect({ to, message }) {
  const dispatch = useDispatch();
  const notified = useRef(false);

  useEffect(() => {
    if (notified.current) return;
    notified.current = true;
    dispatch(pushToast(message));
  }, [dispatch, message]);

  return <Navigate to={to} replace />;
}

/** Gate for the internal (HQ / Internal Team) side of the app. */
export function RequireInternal() {
  const { loggedIn, authType } = useSelector((s) => s.auth);
  if (!loggedIn) return <Navigate to="/login" replace />;
  if (authType !== 'internal') return <PortalRedirect
    to="/supplier/home"
    message="You're signed in as a supplier. You've been redirected to My Invoices. Log out to sign in to the internal portal."
  />;
  return <Outlet />;
}

/** Gate for the supplier side of the app. */
export function RequireSupplier() {
  const { loggedIn, authType } = useSelector((s) => s.auth);
  if (!loggedIn) return <Navigate to="/login" replace />;
  if (AUTH_BYPASS) return <Outlet />;
  if (authType !== 'supplier') return <PortalRedirect
    to="/app/invoices"
    message="You're signed in to the internal portal. You've been redirected to Invoices. Log out to sign in as a supplier."
  />;
  return <Outlet />;
}

/** HQ-only pages (Outputs, Sync Log, Logs/History, Settings, Supplier Visibility) are hidden
 * from an Internal Team (channel-scoped) login, same rule the sidebar itself enforces. */
export function RequireHQ() {
  const { channelScope } = useSelector((s) => s.auth);
  if (channelScope !== 'all') return <Navigate to="/app/invoices" replace />;
  return <Outlet />;
}

export function RequireCapability({ cap, redirect = '/app/invoices' }) {
  const perm = useSelector(selectPerm);
  if (!perm?.[cap]) return <Navigate to={redirect} replace />;
  return <Outlet />;
}

export function SettingsIndexRedirect() {
  const perm = useSelector(selectPerm);
  const target = perm.manageConfig
    ? '/app/settings/integrations'
    : perm.manageUsers
      ? '/app/settings/users'
      : perm.manageRoles
        ? '/app/settings/roles'
        : perm.viewAuditLog
          ? '/app/settings/auditLogs'
          : '/app/invoices';
  return <Navigate to={target} replace />;
}

export function RedirectIfLoggedIn({ children }) {
  const { loggedIn, authType } = useSelector((s) => s.auth);
  if (loggedIn) return <Navigate to={authType === 'supplier' ? '/supplier/home' : '/app/invoices'} replace />;
  return children;
}
