import { api } from './client';

/** Supplier management (app/api/v1/suppliers.py). One function per action-named endpoint. */
export const suppliersApi = {
  searchVendors: (q) => api.get(`/v1/suppliers/search-vendors?q=${encodeURIComponent(q)}`),
  listSuppliers: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return api.get(`/v1/suppliers/list-suppliers${qs ? `?${qs}` : ''}`);
  },
  // Supplier access links are emailed by the server and never returned to the UI.
  addSupplier: (payload) => api.post('/v1/suppliers/add-supplier', payload),
  updateSupplierEmail: (id, email) => api.put(`/v1/suppliers/${id}/update-supplier-email`, { email }),
  updateSupplierVendorCodes: (id, vendorCodes) => api.put(`/v1/suppliers/${id}/update-supplier-vendor-codes`, { vendorCodes }),
  generateSetupLink: (id) => api.post(`/v1/suppliers/${id}/generate-setup-link`),
  resetSupplierPassword: (id) => api.post(`/v1/suppliers/${id}/reset-supplier-password`),
  deactivateSupplier: (id) => api.post(`/v1/suppliers/${id}/deactivate-supplier`),
  activateSupplier: (id) => api.post(`/v1/suppliers/${id}/activate-supplier`),
  deleteSupplier: (id) => api.delete(`/v1/suppliers/${id}/delete-supplier`),

  // Access requests (app/api/v1/supplier_requests.py)
  listRequests: (status) => api.get(`/v1/supplier-requests/list-requests${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  getRequest: (id) => api.get(`/v1/supplier-requests/${id}/request-details`),
  approveRequest: (id, payload) => api.post(`/v1/supplier-requests/${id}/approve-request`, payload),
  rejectRequest: (id, payload) => api.post(`/v1/supplier-requests/${id}/reject-request`, payload),
};

/** The signed-in supplier's own vendor code access requests. */
export const supplierAccessApi = {
  requestChange: (payload) => api.post('/v1/supplier-requests/request-access-change', payload),
  latestRequest: () => api.get('/v1/supplier-requests/my-latest-request'),
};
