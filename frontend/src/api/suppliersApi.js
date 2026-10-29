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
};
