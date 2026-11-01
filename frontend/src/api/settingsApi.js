import { api } from './client';

const role = (name) => `/v1/settings/roles/${encodeURIComponent(name)}`;

/** App settings: portal availability, link expiry, the role matrix and the roles themselves. */
export const settingsApi = {
  save: (values) => api.put('/v1/settings', values),
  portalAvailability: () => api.get('/v1/auth/portal-availability'),
  roleSummary: () => api.get('/v1/settings/role-summary'),
  createRole: (name, copyFrom) => api.post('/v1/settings/roles', { name, copyFrom: copyFrom || null }),
  renameRole: (name, newName) => api.put(role(name), { newName }),
  deleteRole: (name, moveTo) => api.delete(`${role(name)}${moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : ''}`),
  ticketPermissions: () => api.get('/v1/ticket-permissions'),
};
