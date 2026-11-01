import { useLocation, useParams } from 'react-router-dom';
import AuditLogsPanel from '../../components/audit/AuditLogsPanel.jsx';
import IntegrationsTab from './IntegrationsTab.jsx';
import UsersTab from './UsersTab.jsx';
import RolesTab from './RolesTab.jsx';

export default function SettingsPage() {
  const { sub: routeSub } = useParams();
  const location = useLocation();
  const sub = routeSub || location.pathname.split('/').filter(Boolean).at(-1);

  return (
    <div className="dash settings-page">
      {sub === 'integrations' && <IntegrationsTab />}
      {sub === 'auditLogs' && <AuditLogsPanel />}
      {sub === 'users' && <UsersTab />}
      {sub === 'roles' && <RolesTab />}
    </div>
  );
}
