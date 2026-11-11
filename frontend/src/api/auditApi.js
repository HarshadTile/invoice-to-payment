import { api } from './client';

/** Query string for the audit endpoints; 'all' and empty values are left out. */
export function auditQuery(params = {}) {
  return new URLSearchParams(Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== 'all')
    .map(([key, value]) => [key, String(value)])).toString();
}

/** Settings > Audit Logs: one page at a time, filtered and searched on the server. */
export const auditApi = {
  list: (params) => api.get(`/v1/audit-logs?${auditQuery(params)}`),
  /** The CSV export, fetched with the sign-in and saved as a file. */
  async download(params) {
    const response = await fetch(`/api/v1/audit-logs/export?${auditQuery(params)}`, { headers: api.authHeaders() });
    if (!response.ok) throw new Error(`Export failed (HTTP ${response.status})`);
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  },
};
