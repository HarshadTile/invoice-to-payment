import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockApi = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock('./client', () => ({ api: mockApi }));

import { suppliersApi } from './suppliersApi';
import { authApi } from './authApi';
import { ROLE_MATRIX } from '../data/constants';

beforeEach(() => vi.clearAllMocks());

describe('suppliersApi', () => {
  it('calls each action-named endpoint', () => {
    suppliersApi.searchVendors('a b');
    expect(mockApi.get).toHaveBeenCalledWith('/v1/suppliers/search-vendors?q=a%20b');
    suppliersApi.listSuppliers({ search: 'x', status: '' });
    expect(mockApi.get).toHaveBeenCalledWith('/v1/suppliers/list-suppliers?search=x');
    suppliersApi.listSuppliers();
    expect(mockApi.get).toHaveBeenLastCalledWith('/v1/suppliers/list-suppliers');
    suppliersApi.addSupplier({ pan: 'P', vendorCodes: ['V'] });
    expect(mockApi.post).toHaveBeenCalledWith('/v1/suppliers/add-supplier', { pan: 'P', vendorCodes: ['V'] });
    suppliersApi.updateSupplierVendorCodes(3, ['V']);
    expect(mockApi.put).toHaveBeenCalledWith('/v1/suppliers/3/update-supplier-vendor-codes', { vendorCodes: ['V'] });
    suppliersApi.generateSetupLink(3);
    expect(mockApi.post).toHaveBeenLastCalledWith('/v1/suppliers/3/generate-setup-link');
    suppliersApi.resetSupplierPassword(3);
    expect(mockApi.post).toHaveBeenLastCalledWith('/v1/suppliers/3/reset-supplier-password');
    suppliersApi.deactivateSupplier(3);
    expect(mockApi.post).toHaveBeenLastCalledWith('/v1/suppliers/3/deactivate-supplier');
    suppliersApi.activateSupplier(3);
    expect(mockApi.post).toHaveBeenLastCalledWith('/v1/suppliers/3/activate-supplier');
    suppliersApi.deleteSupplier(3);
    expect(mockApi.delete).toHaveBeenCalledWith('/v1/suppliers/3/delete-supplier');
  });

  it('has the public supplier setup calls', () => {
    authApi.checkSetupLink('tok en');
    expect(mockApi.get).toHaveBeenCalledWith('/v1/auth/supplier/check-setup-link?token=tok%20en');
    authApi.completeSupplierSetup({ token: 't', pan: 'P', password: 'pw' });
    expect(mockApi.post).toHaveBeenCalledWith('/v1/auth/supplier/complete-supplier-setup', { token: 't', pan: 'P', password: 'pw' });
  });
});

describe('role matrix', () => {
  it('lets Admin and Invoice Team manage suppliers by default', () => {
    expect(ROLE_MATRIX.Admin.manageSuppliers).toBe(true);
    expect(ROLE_MATRIX['Invoice Team'].manageSuppliers).toBe(true);
    expect(ROLE_MATRIX.Viewer.manageSuppliers).toBe(false);
  });
});
