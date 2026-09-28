import { createSlice, nanoid } from '@reduxjs/toolkit';

const initialState = {
  expandedNav: ['channels'],
  sidebarOpen: false, // off-canvas menu on narrow screens
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
  channelQueryViewMode: 'list',
  supplierHomeTab: 'current',
  supplierVisibilityQuery: 'Tata Communications Ltd',
  globalLogsChannel: null,
  globalLogsStatus: null,
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
    setChannelQueryViewMode(state, action) {
      state.channelQueryViewMode = action.payload;
    },
    setSupplierHomeTab(state, action) {
      state.supplierHomeTab = action.payload;
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
  },
});

export const {
  toggleNavExpanded, ensureNavExpanded, toggleSidebar, closeSidebar, bumpData, openModal, closeModal, pushToast, dismissToast,
  setSearch, setTablePage, toggleSelectRow, setSelectAll, clearSelection,
  setInvoicesTopTab, setTicketFilterStatus,
  setChannelViewTab, setVcodeViewTab, setInquiryViewMode, setInquiryChannelTab,
  setChannelQueryViewMode, setSupplierHomeTab, setSupplierVisibilityQuery,
  setGlobalLogsChannel, setGlobalLogsStatus, resetFiltersOnIdentitySwitch,
} = uiSlice.actions;
export default uiSlice.reducer;
