import { Routes, Route, Navigate } from 'react-router-dom';
import { AUTH_BYPASS } from '../features/auth/authSlice';
import {
  RequireInternal,
  RequireSupplier,
  RequireHQ,
  RequireCapability,
  SettingsIndexRedirect,
  RedirectIfLoggedIn,
} from './ProtectedRoute.jsx';
import AppLayout from '../components/layout/AppLayout.jsx';
import LoginPage from '../pages/LoginPage.jsx';
import InvoicesPage from '../pages/InvoicesPage.jsx';
import SearchInvoicePage from '../pages/SearchInvoicePage.jsx';
import ChannelPage from '../pages/ChannelPage.jsx';
import SupplierVisibilityPage from '../pages/SupplierVisibilityPage.jsx';
import VendorCodePage from '../pages/VendorCodePage.jsx';
import InquiryDeskPage from '../pages/InquiryDeskPage.jsx';
import OutputsPage from '../pages/OutputsPage.jsx';
import SyncLogPage from '../pages/SyncLogPage.jsx';
import GlobalLogsPage from '../pages/GlobalLogsPage.jsx';
import SettingsPage from '../pages/SettingsPage.jsx';
import ProfilePage from '../pages/ProfilePage.jsx';
import SupplierHomePage from '../pages/supplier/SupplierHomePage.jsx';
import SupplierLogsPage from '../pages/supplier/SupplierLogsPage.jsx';
import SupplierTicketsPage from '../pages/supplier/SupplierTicketsPage.jsx';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={AUTH_BYPASS ? '/app/invoices' : '/login'} replace />} />
      <Route path="/login" element={AUTH_BYPASS ? <Navigate to="/app/invoices" replace /> : <RedirectIfLoggedIn><LoginPage /></RedirectIfLoggedIn>} />

      {/* Internal / HQ side */}
      <Route element={<RequireInternal />}>
        <Route element={<AppLayout />}>
          <Route path="/app" element={<Navigate to="/app/invoices" replace />} />
          <Route path="/app/invoices" element={<InvoicesPage />} />
          <Route path="/app/search" element={<SearchInvoicePage />} />
          <Route path="/app/channel/:key" element={<ChannelPage />} />
          <Route path="/app/vendor-code/:code" element={<VendorCodePage />} />
          <Route path="/app/inquiry-desk" element={<InquiryDeskPage />} />
          <Route path="/app/profile" element={<ProfilePage />} />

          <Route element={<RequireHQ />}>
            <Route path="/app/supplier-visibility" element={<SupplierVisibilityPage />} />
            <Route path="/app/outputs" element={<OutputsPage />} />
            <Route path="/app/sync-log" element={<SyncLogPage />} />
            <Route path="/app/logs" element={<GlobalLogsPage />} />
            <Route element={<RequireCapability cap="manageConfig" />}>
              <Route path="/app/settings/integrations" element={<SettingsPage />} />
              <Route path="/app/settings/notifications" element={<SettingsPage />} />
            </Route>
            <Route path="/app/settings/auditLogs" element={<SettingsPage />} />
            <Route element={<RequireCapability cap="manageUsers" />}>
              <Route path="/app/settings/users" element={<SettingsPage />} />
              <Route path="/app/settings/roles" element={<SettingsPage />} />
            </Route>
            <Route path="/app/settings" element={<SettingsIndexRedirect />} />
          </Route>
        </Route>
      </Route>

      {/* Supplier side */}
      <Route element={<RequireSupplier />}>
        <Route element={<AppLayout />}>
          <Route path="/supplier" element={<Navigate to="/supplier/home" replace />} />
          <Route path="/supplier/home" element={<SupplierHomePage />} />
          <Route path="/supplier/vendor-code/:code" element={<VendorCodePage />} />
          <Route path="/supplier/logs" element={<SupplierLogsPage />} />
          <Route path="/supplier/tickets" element={<SupplierTicketsPage />} />
          <Route path="/supplier/profile" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to={AUTH_BYPASS ? '/app/invoices' : '/login'} replace />} />
    </Routes>
  );
}
