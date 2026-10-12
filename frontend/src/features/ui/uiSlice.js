import { createSlice, nanoid } from '@reduxjs/toolkit';
import { logout } from '../auth/authSlice';

const SIDEBAR_COLLAPSED_KEY = 'i2p.sidebarCollapsed';

/** Remembered per browser; storage can be unavailable (private mode, blocked), so never throw. */
export function readSidebarCollapsed() {
  try { return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'; } catch { return false; }
}
export function saveSidebarCollapsed(collapsed) {
  try { window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0'); } catch { /* not persisted */ }
}

/* The top-bar scope (fiscal year, channel, vendor) applies to every internal screen and stays
   until the user clears it. Kept for the browser session (not across browser restarts); `fy`
   null means "the current fiscal year", 'all' means every year. */
const SCOPE_KEY = 'i2p.scopeFilters';
const NO_SCOPE = { fy: null, channel: '', vcode: '' };

function readScope() {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(SCOPE_KEY) || 'null');
    if (saved && typeof saved === 'object') return { ...NO_SCOPE, ...saved };
  } catch { /* unavailable or corrupt: start with no scope */ }
  return { ...NO_SCOPE };
}
export function saveScope(scope) {
  try { window.sessionStorage.setItem(SCOPE_KEY, JSON.stringify(scope)); } catch { /* not persisted */ }
}

const initialState = {
  scope: readScope(),
  expandedNav: ['channels'],
  sidebarOpen: false, // off-canvas menu on narrow screens
  sidebarCollapsed: readSidebarCollapsed(), // icon-only rail on wide screens
  dataVersion: 0, // bumped when runtime.invoices is edited in place, so views re-read it
  modal: null, // { kind, ctx }
  toasts: [], // { id, msg }
  search: {}, // tableKey -> string
  tablePage: {}, // tableKey -> number
  tableSelected: {}, // tableKey -> string[] (invoice numbers)
  invoicesTopTab: 'All Invoices',
  ticketFilterStatus: null,
  channelViewTab: {}, // channelKey -> view name
  vcodeViewTab: {}, // code -> view name
  inquiryViewMode: 'list',
  inquiryChannelTab: null,
  supplierVisibilityQuery: 'Tata Communications Ltd',
  globalLogsChannel: null,
  globalLogsStatus: null,
  // Filter-bar state (search text, status, date range) for pages that also mirror
  // it into the URL — keyed the same way as `search`/`tablePage` above, so a
  // filter set on Search Invoice(s) or a channel's Invoice Log survives
  // navigating away and back, instead of resetting because the sidebar always
  // links to the bare path with no query string.
  pageFilters: {}, // filterKey -> arbitrary filter object
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleNavExpanded(state, action) {
      const id = action.payload;
      const i = state.expandedNav.indexOf(id);
      if (i >= 0) state.expandedNav.splice(i, 1); else state.expandedNav.push(id);
    },
    ensureNavExpanded(state, action) {
      if (!state.expandedNav.includes(action.payload)) state.expandedNav.push(action.payload);
    },
    bumpData(state) {
      state.dataVersion += 1;
    },
    toggleSidebar(state) {
      state.sidebarOpen = !state.sidebarOpen;
    },
    closeSidebar(state) {
      state.sidebarOpen = false;
    },
    setScopeFilter(state, action) {
      const { key, value } = action.payload; // key: 'fy' | 'channel' | 'vcode'
      state.scope[key] = key === 'fy' ? (value || null) : (value || '');
    },
    clearScopeFilters(state) {
      state.scope = { fy: 'all', channel: '', vcode: '' };
    },
    toggleSidebarCollapsed(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    setSidebarCollapsed(state, action) {
      state.sidebarCollapsed = !!action.payload;
    },
    openModal(state, action) {
      state.modal = action.payload; // { kind, ctx }
    },
    closeModal(state) {
      state.modal = null;
    },
    pushToast: {
      reducer(state, action) {
        state.toasts.push(action.payload);
      },
      prepare(msg) {
        return { payload: { id: nanoid(), msg } };
      },
    },
    dismissToast(state, action) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
    setSearch(state, action) {
      const { key, value } = action.payload;
      state.search[key] = value;
    },
    setTablePage(state, action) {
      const { key, page } = action.payload;
      state.tablePage[key] = page;
    },
    toggleSelectRow(state, action) {
      const { key, no } = action.payload;
      const sel = state.tableSelected[key] || (state.tableSelected[key] = []);
      const i = sel.indexOf(no);
      if (i >= 0) sel.splice(i, 1); else sel.push(no);
    },
    setSelectAll(state, action) {
      const { key, nos, checked } = action.payload;
      state.tableSelected[key] = checked ? [...new Set(nos)] : [];
    },
    clearSelection(state, action) {
      state.tableSelected[action.payload] = [];
    },
    setInvoicesTopTab(state, action) {
      state.invoicesTopTab = action.payload;
    },
    setTicketFilterStatus(state, action) {
      state.ticketFilterStatus = state.ticketFilterStatus === action.payload ? null : action.payload;
    },
    setChannelViewTab(state, action) {
      const { key, view } = action.payload;
      state.channelViewTab[key] = view;
    },
    setVcodeViewTab(state, action) {
      const { code, view } = action.payload;
      state.vcodeViewTab[code] = view;
    },
    setInquiryViewMode(state, action) {
      state.inquiryViewMode = action.payload;
    },
    setInquiryChannelTab(state, action) {
      state.inquiryChannelTab = action.payload;
    },
    setSupplierVisibilityQuery(state, action) {
      state.supplierVisibilityQuery = action.payload;
    },
    setGlobalLogsChannel(state, action) {
      state.globalLogsChannel = action.payload || null;
    },
    setGlobalLogsStatus(state, action) {
      state.globalLogsStatus = action.payload || null;
    },
    resetFiltersOnIdentitySwitch(state) {
      state.search = {};
    },
    setPageFilters(state, action) {
      const { key, filters } = action.payload;
      state.pageFilters[key] = filters;
    },
  },
  extraReducers: (builder) => {
    // A different person signing in must not inherit the previous person's scope.
    builder.addCase(logout, (state) => { state.scope = { ...NO_SCOPE }; });
  },
});

export const {
  toggleNavExpanded, ensureNavExpanded, toggleSidebar, closeSidebar, setScopeFilter, clearScopeFilters, toggleSidebarCollapsed, setSidebarCollapsed, bumpData, openModal, closeModal, pushToast, dismissToast,
  setSearch, setTablePage, toggleSelectRow, setSelectAll, clearSelection,
  setInvoicesTopTab, setTicketFilterStatus,
  setChannelViewTab, setVcodeViewTab, setInquiryViewMode, setInquiryChannelTab,
  setSupplierVisibilityQuery,
  setGlobalLogsChannel, setGlobalLogsStatus, resetFiltersOnIdentitySwitch, setPageFilters,
} = uiSlice.actions;
export default uiSlice.reducer;
