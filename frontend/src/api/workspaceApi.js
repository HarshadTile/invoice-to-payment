import { api } from './client';

/** The signed-in person's workspace: the start-up bundle, the stored tables and the activity logs. */
export const workspaceApi = {
  load: () => api.get('/v1/load-workspace-data'),
  getTable: (key) => api.get(`/v1/tables/${key}`),
  saveTable: (key, rows) => api.put(`/v1/tables/${key}`, { rows }),
  internalActivityLog: () => api.get('/v1/tickets/internal-activity-log'),
  supplierActivityLog: () => api.get('/v1/tickets/supplier-activity-log'),
};
