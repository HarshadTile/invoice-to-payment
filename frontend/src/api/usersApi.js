import { api } from './client';

/** Real login accounts (app/models/user.py) — distinct from any other table-backed data. */
export const usersApi = {
  list: () => api.get('/v1/users/'),
  create: (payload) => api.post('/v1/users/', payload),
  update: (id, payload) => api.patch(`/v1/users/${id}`, payload),
  remove: (id) => api.delete(`/v1/users/${id}`),
  // Emails the account holder a reset link — no password is set or seen here.
  resetPassword: (id) => api.post(`/v1/users/${id}/reset-password`),
};
