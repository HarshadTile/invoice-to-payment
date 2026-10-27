export const LINK_EXPIRY_OPTIONS = [
  [30, '30 minutes'], [60, '1 hour'], [240, '4 hours'], [720, '12 hours'],
  [1440, '24 hours'], [2880, '2 days'], [4320, '3 days'], [10080, '7 days'],
];
export function formatLinkExpiry(minutes) {
  return LINK_EXPIRY_OPTIONS.find(([value]) => value === minutes)?.[1] || `${minutes} minutes`;
}
