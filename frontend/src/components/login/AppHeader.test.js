import { describe, it, expect } from 'vitest';
import { helpManual } from './AppHeader.jsx';

describe('Help on the sign-in pages', () => {
  it.each([
    ['/login', '', '/user-manual/vendor-view.pdf'],
    ['/login', '?account=supplier', '/user-manual/vendor-view.pdf'],
    ['/login', '?account=internal', '/user-manual/all-channels-hq.pdf'],
    ['/supplier/request-access', '', '/user-manual/vendor-view.pdf'],
    ['/forgot-password', '', '/user-manual/all-channels-hq.pdf'],
  ])('%s%s → %s', (pathname, search, url) => {
    expect(helpManual({ pathname, search })).toBe(url);
  });
});
