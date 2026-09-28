import { createSelector } from '@reduxjs/toolkit';
import { runtime } from '../../data/runtime';
import { CHANNEL_LABEL } from '../../data/constants';

/** Every invoice a login is allowed to see, given the current auth scope.
 * Memoized so the same channelScope always returns the same array reference.
 *
 * channelScope values:
 *   'all'        — HQ: all invoices
 *   'msetuSrm'   — locked to Msetu / SRM only
 *   'poPortal'   — locked to PO Portal only
 *   'mfoxPortal' — locked to MFOX Portal only */
export const selectScopedInvoices = createSelector(
  // dataVersion only exists to invalidate the memo after an in-place invoice edit
  [(state) => state.auth.authType, (state) => state.auth.channelScope, (state) => state.ui.dataVersion],
  (authType, channelScope) => {
    if (authType === 'supplier') return [...runtime.invoices]; // supplier-side pages filter by vcode themselves
    if (channelScope !== 'all') return runtime.invoices.filter((i) => i.channel === channelScope);
    return [...runtime.invoices];
  },
);

export function selectInternalScopeLabel(state) {
  if (state.auth.channelScope === 'all') return '';
  return CHANNEL_LABEL[state.auth.channelScope] || '';
}
