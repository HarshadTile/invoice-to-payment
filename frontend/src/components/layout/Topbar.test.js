import { describe, it, expect } from 'vitest';
import { userManualUrl } from './Topbar.jsx';

describe('Help opens the manual for the signed-in workspace', () => {
  it.each([
    ['supplier', 'all', '/user-manual/vendor-view.pdf'],
    ['internal', 'all', '/user-manual/all-channels-hq.pdf'],
    ['internal', 'msetuSrm', '/user-manual/msetu-srm.pdf'],
    ['internal', 'poPortal', '/user-manual/po-portal.pdf'],
    ['internal', 'mfoxPortal', '/user-manual/all-channels-hq.pdf'],
  ])('%s / %s → %s', (authType, scope, url) => {
    expect(userManualUrl(authType, scope)).toBe(url);
  });
});
