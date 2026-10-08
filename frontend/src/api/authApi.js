import { api } from './client';

/** Public, unauthenticated endpoints for the forgot/reset-password flow. */
export const authApi = {
  forgotPassword: (email) => api.post('/v1/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post('/v1/auth/reset-password', { token, password }),
};
