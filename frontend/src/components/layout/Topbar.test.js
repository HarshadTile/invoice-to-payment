import { describe, it, expect } from 'vitest';
import { userManualUrl } from '../../utils/manuals';

describe('Help opens the manual for the signed-in workspace', () => {
  it('suppliers get the public Vendor View manual', () => {
    expect(userManualUrl('supplier')).toBe('/user-manual/vendor-view.pdf');
  });

  it('staff manuals come from the backend, which needs a sign-in and picks the portal', () => {
    expect(userManualUrl('internal')).toBe('/api/v1/help/user-manual');
  });
});
