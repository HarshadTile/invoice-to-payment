/* Where the user manuals live. Only the supplier manual is public (dummy-data screenshots);
 * staff manuals show real screens and are served by the backend to signed-in staff only. */
export const SUPPLIER_MANUAL_URL = '/user-manual/vendor-view.pdf';
export const STAFF_MANUAL_API = '/api/v1/help/user-manual';

/** The manual for this sign-in: the public supplier PDF, or the staff endpoint (which picks the
 *  manual for the portal the person signed in to, and needs their sign-in). */
export function userManualUrl(authType) {
  return authType === 'supplier' ? SUPPLIER_MANUAL_URL : STAFF_MANUAL_API;
}
