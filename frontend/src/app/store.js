import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice';
import tablesReducer from '../features/tables/tablesSlice';
import settingsReducer from '../features/settings/settingsSlice';
import uiReducer from '../features/ui/uiSlice';

import { ticketsApi } from '../features/tickets/ticketsApi';
import { notificationsApi } from '../features/notifications/notificationsApi';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    tables: tablesReducer,
    settings: settingsReducer,
    ui: uiReducer,
    [ticketsApi.reducerPath]: ticketsApi.reducer,
    [notificationsApi.reducerPath]: notificationsApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(ticketsApi.middleware, notificationsApi.middleware),
});
