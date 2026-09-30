import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { api } from '../../api/client';

const mapTicket = (t) => ({
  ...t,
  desc: t.description,
  status: t.status === 'OPEN' ? 'Open' : t.status === 'IN_PROGRESS' ? 'In Progress' : t.status === 'RESOLVED' ? 'Resolved' : t.status === 'CLOSED' ? 'Closed' : t.status,
  priority: t.priority === 'HIGH' ? 'High' : t.priority === 'MEDIUM' ? 'Medium' : t.priority === 'LOW' ? 'Low' : t.priority,
  raisedBy: t.raised_by,
  raisedDate: t.raised_date,
  slaHours: t.sla_hours,
  resolvedDate: t.resolved_date,
  comments: t.comments?.map(c => ({
    ...c,
    author: c.author_name || c.author,
    date: c.date || c.created_at
  })) || [],
  activity: t.activities?.map(a => ({
    text: `${a.event}: ${a.meta_data || ''}`,
    date: a.created_at
  })) || []
});

const customBaseQuery = async (args) => {
  try {
    let result;
    const url = typeof args === 'string' ? args : args.url;
    const method = (typeof args === 'object' && args.method) ? args.method : 'GET';
    const body = typeof args === 'object' ? args.body : undefined;
    
    // Map URL correctly for the client which prepends /api
    const path = `/v1/tickets${url || ''}`;
    
    if (method === 'GET') {
      result = await api.get(path);
    } else if (method === 'POST') {
      result = await api.post(path, body);
    } else if (method === 'PATCH') {
      result = await api.patch(path, body);
    } else if (method === 'PUT') {
      result = await api.put(path, body);
    }
    
    return { data: result };
  } catch (err) {
    return {
      error: {
        status: err.status || 500,
        data: err.message || 'Unknown error',
      },
    };
  }
};

export const ticketsApi = createApi({
  reducerPath: 'ticketsApi',
  baseQuery: customBaseQuery,
  tagTypes: ['Ticket', 'TicketList'],
  endpoints: (builder) => ({
    getTickets: builder.query({
      query: (filters = {}) => {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(filters)) {
          if (v) params.append(k, v);
        }
        const qs = params.toString();
        return qs ? `?${qs}` : '';
      },
      transformResponse: (res) => res.map(mapTicket),
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'Ticket', id })),
              { type: 'TicketList', id: 'LIST' },
            ]
          : [{ type: 'TicketList', id: 'LIST' }],
    }),
    getTicket: builder.query({
      query: (id) => `/${id}`,
      transformResponse: mapTicket,
      providesTags: (result, error, id) => [{ type: 'Ticket', id }],
    }),
    createTicket: builder.mutation({
      query: ({ idempotencyKey, ...body }) => ({
        url: '',
        method: 'POST',
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
        body,
      }),
      invalidatesTags: [{ type: 'TicketList', id: 'LIST' }],
    }),
    replyToTicket: builder.mutation({
      query: ({ id, text, visibility, expected_version }) => ({
        url: `/${id}/comments`,
        method: 'POST',
        body: { text, visibility, expected_version },
      }),
      async onQueryStarted({ id, text, visibility, expected_version, author, role }, { dispatch, queryFulfilled }) {
        // Optimistic update
        const patchResult = dispatch(
          ticketsApi.util.updateQueryData('getTicket', id, (draft) => {
            draft.comments.push({
              text,
              visibility,
              author: author || 'You',
              role: role || '',
              date: new Date().toISOString(),
              seq: draft.comments.length + 1
            });
          })
        );
        try {
          await queryFulfilled;
        } catch (err) {
          patchResult.undo();
          if (err.error?.status === 409) {
            dispatch(ticketsApi.util.invalidateTags([{ type: 'Ticket', id }]));
          }
        }
      },
      invalidatesTags: (result, error, { id }) => [{ type: 'Ticket', id }],
    }),
    assignTicket: builder.mutation({
      query: ({ id, assignee_id, note, expected_version }) => ({
        url: `/${id}/assign`,
        method: 'POST',
        body: { assignee_id, note, expected_version },
      }),
      async onQueryStarted({ id, assignee_id, note, expected_version, assignee_name }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          ticketsApi.util.updateQueryData('getTicket', id, (draft) => {
            draft.assignee = { id: assignee_id, name: assignee_name };
            if (draft.status === 'OPEN') {
                draft.status = 'IN_PROGRESS';
            }
          })
        );
        try {
          await queryFulfilled;
        } catch (err) {
          patchResult.undo();
          if (err.error?.status === 409) {
            dispatch(ticketsApi.util.invalidateTags([{ type: 'Ticket', id }]));
          }
        }
      },
      invalidatesTags: (result, error, { id }) => [
          { type: 'Ticket', id }, 
          { type: 'TicketList', id: 'LIST' }
      ],
    }),
    resolveTicket: builder.mutation({
      query: ({ id, resolution_note, expected_version }) => ({
        url: `/${id}/resolve`,
        method: 'POST',
        body: { resolution_note, expected_version },
      }),
      async onQueryStarted({ id, resolution_note, expected_version }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          ticketsApi.util.updateQueryData('getTicket', id, (draft) => {
            draft.status = 'RESOLVED';
          })
        );
        try {
          await queryFulfilled;
        } catch (err) {
          patchResult.undo();
          if (err.error?.status === 409) {
            dispatch(ticketsApi.util.invalidateTags([{ type: 'Ticket', id }]));
          }
        }
      },
      invalidatesTags: (result, error, { id }) => [
          { type: 'Ticket', id }, 
          { type: 'TicketList', id: 'LIST' }
      ],
    }),
    closeTicket: builder.mutation({
        query: ({ id }) => ({
          url: `/${id}/close`,
          method: 'POST',
        }),
        invalidatesTags: (result, error, { id }) => [
            { type: 'Ticket', id }, 
            { type: 'TicketList', id: 'LIST' }
        ],
    }),
    reopenTicket: builder.mutation({
        query: ({ id, reason, expected_version }) => ({
          url: `/${id}/reopen`,
          method: 'POST',
          body: { reason, expected_version }
        }),
        invalidatesTags: (result, error, { id }) => [
            { type: 'Ticket', id }, 
            { type: 'TicketList', id: 'LIST' }
        ],
    })
  }),
});

export const {
  useGetTicketsQuery,
  useGetTicketQuery,
  useCreateTicketMutation,
  useReplyToTicketMutation,
  useAssignTicketMutation,
  useResolveTicketMutation,
  useCloseTicketMutation,
  useReopenTicketMutation
} = ticketsApi;
