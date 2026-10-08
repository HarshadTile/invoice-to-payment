import { beforeEach, describe, expect, it } from 'vitest';
import { setRuntimeData } from '../../data/runtime';
import { selectFilteredInvoices, selectFilteredInvoicesAnyChannel, selectFilteredInvoicesAnyVendor } from './selectors';
import uiReducer, { clearScopeFilters, setScopeFilter } from '../ui/uiSlice';
import { resolveScope, currentFiscalYear } from '../ui/scope';

const inv = (no, vcode, channel, rawDate) => ({ no, vcode, channel, rawDate, date: rawDate, vendor: vcode, po: '1', poItem: '', status: 'Paid', amount: '-', utr: '-' });
const FY = currentFiscalYear();
const thisYear = FY.slice(0, 4);
const lastYear = String(Number(thisYear) - 1);

let version = 0;
function state(scope, { authType = 'internal', channelScope = 'all' } = {}) {
  version += 1; // dataVersion is what invalidates the selector memo between cases
  return { auth: { authType, channelScope }, ui: { dataVersion: version, scope } };
}

describe('shared top-bar scope', () => {
  beforeEach(() => {
    setRuntimeData({
      invoices: [
        inv('A', 'V1', 'msetuSrm', `${thisYear}-06-10`),
        inv('B', 'V1', 'poPortal', `${thisYear}-07-10`),
        inv('C', 'V2', 'msetuSrm', `${thisYear}-08-10`),
        inv('D', 'V2', 'msetuSrm', `${lastYear}-01-10`), // previous fiscal year
      ],
      syncLog: [],
    });
  });

  it('defaults to the current fiscal year, and "all" removes that limit', () => {
    expect(selectFilteredInvoices(state({ fy: null, channel: '', vcode: '' })).map((i) => i.no)).toEqual(['A', 'B', 'C']);
    expect(selectFilteredInvoices(state({ fy: 'all', channel: '', vcode: '' })).map((i) => i.no)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('applies vendor and channel together', () => {
    const scope = { fy: 'all', channel: 'msetuSrm', vcode: 'V1' };
    expect(selectFilteredInvoices(state(scope)).map((i) => i.no)).toEqual(['A']);
  });

  it("a channel page keeps its own channel, and a vendor page keeps its own vendor", () => {
    const scope = { fy: 'all', channel: 'poPortal', vcode: 'V2' };
    // channel filter not applied: vendor V2 across channels
    expect(selectFilteredInvoicesAnyChannel(state(scope)).map((i) => i.no)).toEqual(['C', 'D']);
    // vendor filter not applied: channel poPortal across vendors
    expect(selectFilteredInvoicesAnyVendor(state(scope)).map((i) => i.no)).toEqual(['B']);
  });

  it('never narrows a supplier login, whose pages apply the year themselves', () => {
    const list = selectFilteredInvoices(state({ fy: 'all', channel: 'poPortal', vcode: 'V2' }, { authType: 'supplier' }));
    expect(list).toHaveLength(4);
  });

  it('a channel-locked login stays inside its own channel whatever is chosen', () => {
    const list = selectFilteredInvoices(state({ fy: 'all', channel: '', vcode: '' }, { channelScope: 'poPortal' }));
    expect(list.map((i) => i.no)).toEqual(['B']);
  });
});

describe('scope state', () => {
  it('sets, clears and resolves the scope', () => {
    let s = uiReducer(undefined, { type: 'init' });
    s = uiReducer(s, setScopeFilter({ key: 'vcode', value: 'V1' }));
    s = uiReducer(s, setScopeFilter({ key: 'channel', value: 'poPortal' }));
    expect(resolveScope(s.scope)).toMatchObject({ vcode: 'V1', channel: 'poPortal', fy: FY, fyChosen: false });
    s = uiReducer(s, setScopeFilter({ key: 'fy', value: '2025-26' }));
    expect(resolveScope(s.scope)).toMatchObject({ fy: '2025-26', fyChosen: true });
    s = uiReducer(s, clearScopeFilters());
    expect(resolveScope(s.scope)).toMatchObject({ vcode: '', channel: '', fy: 'all' });
  });

  it('is reset when someone logs out', () => {
    let s = uiReducer(undefined, setScopeFilter({ key: 'vcode', value: 'V1' }));
    s = uiReducer(s, { type: 'auth/logout' });
    expect(s.scope).toEqual({ fy: null, channel: '', vcode: '' });
  });
});
