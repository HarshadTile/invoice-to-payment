import { createSelector } from '@reduxjs/toolkit';
import { runtime } from '../../data/runtime';
import { CHANNEL_LABEL } from '../../data/constants';
import { getFiscalYear } from '../../utils/businessLogic';
import { resolveScope, selectScope } from '../ui/scope';

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

/* ---- the shared top-bar scope (fiscal year / channel / vendor) applied to the invoice lists ----
 * selectScopedInvoices above is what a login may *access*; these narrow it to what the user has
 * chosen in the top bar, so every internal screen shows the same slice. Lookups of one specific
 * invoice (detail dialogs) keep using the access list so a filter can't make an invoice vanish.
 * Suppliers have no such filters on their invoices (their pages apply the year themselves). */
/** Fiscal year (Apr-Mar) of the invoice itself, from its invoice date, not from whichever
 *  stage date happens to be on show. */
export function invoiceFiscalYear(inv) {
  const ymd = inv.rawDate;
  if (ymd) {
    const year = Number(String(ymd).slice(0, 4));
    const month = Number(String(ymd).slice(5, 7));
    if (year && month) {
      const start = month < 4 ? year - 1 : year;
      return `${start}-${String(start + 1).slice(2)}`;
    }
  }
  return inv.date ? getFiscalYear(inv.date) : '';
}

function applyScope(list, scope, { channel = true, vendor = true } = {}) {
  const { fy, channel: ch, vcode } = resolveScope(scope);
  return list.filter((inv) => {
    if (channel && ch && inv.channel !== ch) return false;
    if (vendor && vcode && inv.vcode !== vcode) return false;
    if (fy !== 'all' && invoiceFiscalYear(inv) && invoiceFiscalYear(inv) !== fy) return false;
    return true;
  });
}

const authType = (state) => state.auth.authType;
const make = (options) => createSelector(
  [selectScopedInvoices, selectScope, authType],
  (list, scope, type) => (type === 'supplier' ? list : applyScope(list, scope, options)),
);

/** Everything the top-bar scope selects. */
export const selectFilteredInvoices = make({});
/** For a channel's own page: the page defines the channel, so the channel filter isn't applied. */
export const selectFilteredInvoicesAnyChannel = make({ channel: false });
/** For vendor-centred pages (Supplier Visibility, a vendor code): the page defines the vendor. */
export const selectFilteredInvoicesAnyVendor = make({ vendor: false });
