import { api } from './client';

/** Public, unauthenticated endpoints: forgot/reset password and the supplier setup link. */
export const authApi = {
  passwordLinkInfo: (token) => api.post('/v1/auth/password-link-info', { token }),
  forgotPassword: (email) => api.post('/v1/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post('/v1/auth/reset-password', { token, password }),
  checkSetupLink: (token) => api.get(`/v1/auth/supplier/check-setup-link?token=${encodeURIComponent(token)}`),
  completeSupplierSetup: ({ token, pan, password }) => api.post('/v1/auth/supplier/complete-supplier-setup', { token, pan, password }),
};
