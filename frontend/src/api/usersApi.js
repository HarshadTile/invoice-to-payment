import { api } from './client';

/** Real login accounts (app/models/user.py) — distinct from any other table-backed data. */
export const usersApi = {
  list: () => api.get('/v1/users/list-users'),
  create: (payload) => api.post('/v1/users/add-user', payload),
  update: (id, payload) => api.patch(`/v1/users/${id}/update-user`, payload),
  remove: (id) => api.delete(`/v1/users/${id}/delete-user`),
  // Returns a one-time setup/reset link for the administrator to share privately.
  resetPassword: (id) => api.post(`/v1/users/${id}/send-access-link`),
};
