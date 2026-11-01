import { api } from './client';

const LOGIN_PATH = {
  supplierPassword: '/v1/auth/supplier/login-with-password',
  supplier: '/v1/auth/supplier/login',
  internal: '/v1/auth/login',
};

/** Sign-in and session, plus the public endpoints: forgot/reset password, the supplier setup
 *  link and supplier access requests. */
export const authApi = {
  login: (mode, body) => api.post(LOGIN_PATH[mode] || LOGIN_PATH.internal, body),
  me: () => api.get('/v1/auth/me'),
  logout: () => api.post('/v1/auth/logout'),
  passwordLinkInfo: (token) => api.post('/v1/auth/password-link-info', { token }),
  forgotPassword: (email) => api.post('/v1/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post('/v1/auth/reset-password', { token, password }),
  checkSetupLink: (token) => api.get(`/v1/auth/supplier/check-setup-link?token=${encodeURIComponent(token)}`),
  completeSupplierSetup: ({ token, email, password }) => api.post('/v1/auth/supplier/complete-supplier-setup', { token, email, password }),
  supplierForgotPassword: (email) => api.post('/v1/auth/supplier/forgot-password', { email }),
  submitSupplierRequest: (payload) => api.post('/v1/supplier-requests/submit-request', payload),
};
