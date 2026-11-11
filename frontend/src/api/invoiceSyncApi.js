import { createApi } from '@reduxjs/toolkit/query/react';
import { restBaseQuery } from './baseQuery';

/* The automatic invoice sync from BigQuery: how fresh the data is ("data as of"), how the last
 * sync went, and "Sync now" for integration managers. The backend owns the schedule; the app only
 * shows it. Polled gently, since the data itself changes at most a few times an hour. */

export const SYNC_POLL_MS = 5 * 60 * 1000;
export const SYNC_LIVE = { pollingInterval: SYNC_POLL_MS, skipPollingIfUnfocused: true, refetchOnFocus: true };

export const invoiceSyncApi = createApi({
  reducerPath: 'invoiceSyncApi',
  baseQuery: restBaseQuery('/v1/invoice-sync'),
  tagTypes: ['SyncStatus'],
  endpoints: (build) => ({
    // `identity` only keys the cache, so one person's view is never shown to the next.
    getSyncStatus: build.query({
      query: () => '/status',
      providesTags: ['SyncStatus'],
    }),
    runSyncNow: build.mutation({
      query: () => ({ url: '/run', method: 'POST' }),
      invalidatesTags: ['SyncStatus'],
    }),
  }),
});

export const { useGetSyncStatusQuery, useRunSyncNowMutation } = invoiceSyncApi;
