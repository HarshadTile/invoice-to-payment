import { createApi } from '@reduxjs/toolkit/query/react';
import { api } from '../../api/client';

/* One shared source of truth for notifications. The bell and the Notifications page both read
 * from here, so reading something in one place updates the other straight away and there is a
 * single poll instead of two. Every query carries `identity` (who is signed in) purely as a cache
 * key, so one person's notifications can never be shown to the next person on the same browser. */

const customBaseQuery = async ({ url, method = 'GET', body }) => {
  try {
    const verb = method.toLowerCase();
    const data = verb === 'get' ? await api.get(`/v1/notifications${url}`) : await api[verb](`/v1/notifications${url}`, body);
    return { data };
  } catch (error) {
    return { error: { status: error.status || 500, message: error.message } };
  }
};

export const NOTIFICATION_POLL_MS = 60000;
export const NOTIFICATION_LIVE = { pollingInterval: NOTIFICATION_POLL_MS, skipPollingIfUnfocused: true, refetchOnFocus: true, refetchOnReconnect: true };

const nowIso = () => new Date().toISOString();

/** Apply `change` to the unread count and to every cached notification list. Returns an undo. */
function patchCaches(dispatch, getState, identity, changeList, countDelta) {
  const undo = [];
  const lists = notificationsApi.util.selectInvalidatedBy(getState(), [{ type: 'Notification', id: 'LIST' }]);
  lists
    .filter((entry) => entry.endpointName === 'getNotifications' && entry.originalArgs?.identity === identity)
    .forEach((entry) => {
      undo.push(dispatch(notificationsApi.util.updateQueryData('getNotifications', entry.originalArgs, (draft) => { changeList(draft); })));
    });
  if (countDelta) {
    undo.push(dispatch(notificationsApi.util.updateQueryData('getUnreadCount', { identity }, (draft) => {
      draft.unread = Math.max(0, draft.unread + countDelta);
    })));
  }
  return () => undo.forEach((u) => u.undo());
}

/** Is this notification currently unread in any cached list? (Decides whether the badge drops by one.) */
function isCachedUnread(state, identity, id) {
  return notificationsApi.util.selectInvalidatedBy(state, [{ type: 'Notification', id: 'LIST' }])
    .filter((entry) => entry.endpointName === 'getNotifications' && entry.originalArgs?.identity === identity)
    .some((entry) => {
      const cached = notificationsApi.endpoints.getNotifications.select(entry.originalArgs)(state).data || [];
      return cached.some((n) => n.id === id && !n.read_at);
    });
}

export const notificationsApi = createApi({
  reducerPath: 'notificationsApi',
  baseQuery: customBaseQuery,
  tagTypes: ['Notification'],
  endpoints: (builder) => ({
    getNotifications: builder.query({
      query: ({ limit = 50 }) => ({ url: `?limit=${limit}` }),
      providesTags: [{ type: 'Notification', id: 'LIST' }],
    }),
    getUnreadCount: builder.query({
      query: () => ({ url: '/unread-count' }),
      providesTags: [{ type: 'Notification', id: 'COUNT' }],
    }),
    markNotificationRead: builder.mutation({
      query: ({ id }) => ({ url: `/${id}/read`, method: 'POST' }),
      async onQueryStarted({ id, identity }, { dispatch, getState, queryFulfilled }) {
        const wasUnread = isCachedUnread(getState(), identity, id);
        const undo = patchCaches(dispatch, getState, identity, (list) => {
          const item = list.find((n) => n.id === id);
          if (item && !item.read_at) item.read_at = nowIso();
        }, wasUnread ? -1 : 0);
        try { await queryFulfilled; } catch { undo(); }
      },
      invalidatesTags: [{ type: 'Notification', id: 'COUNT' }],
    }),
    markAllNotificationsRead: builder.mutation({
      query: () => ({ url: '/read-all', method: 'POST' }),
      async onQueryStarted({ identity }, { dispatch, getState, queryFulfilled }) {
        const readAt = nowIso();
        const undo = patchCaches(dispatch, getState, identity, (list) => {
          list.forEach((n) => { if (!n.read_at) n.read_at = readAt; });
        }, 0);
        const undoCount = dispatch(notificationsApi.util.updateQueryData('getUnreadCount', { identity }, (draft) => { draft.unread = 0; }));
        try { await queryFulfilled; } catch { undo(); undoCount.undo(); }
      },
      invalidatesTags: [{ type: 'Notification', id: 'LIST' }, { type: 'Notification', id: 'COUNT' }],
    }),
    // Opening a query clears this person's notifications about it.
    markTicketNotificationsRead: builder.mutation({
      query: ({ ticketId }) => ({ url: `/ticket/${ticketId}/read`, method: 'POST' }),
      invalidatesTags: [{ type: 'Notification', id: 'LIST' }, { type: 'Notification', id: 'COUNT' }],
    }),
  }),
});

export const {
  useGetNotificationsQuery,
  useGetUnreadCountQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useMarkTicketNotificationsReadMutation,
} = notificationsApi;
