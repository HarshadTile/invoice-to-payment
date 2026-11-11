import { describe, it, expect } from 'vitest';
import { helpManual } from './AppHeader.jsx';

describe('Help on the sign-in pages: only the supplier manual is public', () => {
  it.each([
    ['/login', '', '/user-manual/vendor-view.pdf'],
    ['/login', '?account=supplier', '/user-manual/vendor-view.pdf'],
    ['/login', '?account=internal', null],
    ['/supplier/request-access', '', '/user-manual/vendor-view.pdf'],
    ['/forgot-password', '', null],
  ])('%s%s → %s', (pathname, search, url) => {
    expect(helpManual({ pathname, search })).toBe(url);
  });
});
