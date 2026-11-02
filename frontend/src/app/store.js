import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice';
import tablesReducer from '../features/tables/tablesSlice';
import settingsReducer from '../features/settings/settingsSlice';
import uiReducer from '../features/ui/uiSlice';

import { ticketsApi } from '../api/ticketsApi';
import { notificationsApi } from '../api/notificationsApi';
import { invoicesQueryApi } from '../api/invoicesQueryApi';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    tables: tablesReducer,
    settings: settingsReducer,
    ui: uiReducer,
    [ticketsApi.reducerPath]: ticketsApi.reducer,
    [notificationsApi.reducerPath]: notificationsApi.reducer,
    [invoicesQueryApi.reducerPath]: invoicesQueryApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(ticketsApi.middleware, notificationsApi.middleware, invoicesQueryApi.middleware),
});
