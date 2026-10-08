import { createApi } from '@reduxjs/toolkit/query/react';
import { api } from '../../api/client';

function queryString(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const value = search.toString();
  return value ? `?${value}` : '';
}

const customBaseQuery = async (args) => {
  try {
    const request = typeof args === 'string' ? { url: args } : args;
    const method = (request.method || 'GET').toLowerCase();
    const path = `/v1/tickets${request.url || ''}`;
    const data = method === 'get'
      ? await api.get(path, { headers: request.headers })
      : await api[method](path, request.body, { headers: request.headers });
    return { data };
  } catch (error) {
    return { error: { status: error.status || 500, data: { message: error.message } } };
  }
};

const ticketTags = (result) => [
  ...(result?.items || []).map(({ id }) => ({ type: 'Ticket', id })),
  { type: 'TicketList', id: 'LIST' },
];

const mutationTags = (_result, _error, { id }) => [
  { type: 'Ticket', id },
  { type: 'Activity', id },
  { type: 'TicketList', id: 'LIST' },
  { type: 'Summary', id: 'CURRENT' },
];

export const ticketsApi = createApi({
  reducerPath: 'ticketsApi',
  baseQuery: customBaseQuery,
  tagTypes: ['Ticket', 'TicketList', 'Summary', 'Activity', 'Assignable'],
  endpoints: (builder) => ({
    getTickets: builder.query({
      query: (filters = {}) => queryString(filters),
      providesTags: ticketTags,
    }),
    getTicket: builder.query({
      query: (id) => `/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Ticket', id }],
    }),
    getTicketSummary: builder.query({
      query: (filters = {}) => `/summary${queryString(filters)}`,
      providesTags: [{ type: 'Summary', id: 'CURRENT' }],
    }),
    getTicketBoard: builder.query({
      query: (filters = {}) => `/board${queryString(filters)}`,
      providesTags: [{ type: 'TicketList', id: 'LIST' }],
    }),
    getTicketActivity: builder.query({
      query: (id) => `/${id}/activity`,
      providesTags: (_result, _error, id) => [{ type: 'Activity', id }],
    }),
    getAssignableUsers: builder.query({
      query: (channel) => `/assignable-users${queryString({ channel })}`,
      providesTags: (_result, _error, channel) => [{ type: 'Assignable', id: channel }],
    }),
    createTicket: builder.mutation({
      query: ({ idempotencyKey, ...body }) => ({
        url: '',
        method: 'POST',
        body,
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
      }),
      invalidatesTags: ['TicketList', 'Summary'],
    }),
    replyToTicket: builder.mutation({
      query: ({ id, body, visibility = 'PUBLIC', expected_version }) => ({
        url: `/${id}/comments`,
        method: 'POST',
        body: { body, visibility, expected_version },
      }),
      invalidatesTags: mutationTags,
    }),
    assignTicket: builder.mutation({
      query: ({ id, assignee_id, note, expected_version }) => ({
        url: `/${id}/assign`,
        method: 'POST',
        body: { assignee_id, note: note || null, expected_version },
      }),
      invalidatesTags: mutationTags,
    }),
    updateTicket: builder.mutation({
      query: ({ id, expected_version, ...body }) => ({
        url: `/${id}`,
        method: 'PATCH',
        body: { ...body, expected_version },
      }),
      invalidatesTags: mutationTags,
    }),
    resolveTicket: builder.mutation({
      query: ({ id, resolution_note, expected_version }) => ({
        url: `/${id}/resolve`,
        method: 'POST',
        body: { resolution_note, expected_version },
      }),
      invalidatesTags: mutationTags,
    }),
    closeTicket: builder.mutation({
      query: ({ id, expected_version }) => ({
        url: `/${id}/close`,
        method: 'POST',
        body: { expected_version },
      }),
      invalidatesTags: mutationTags,
    }),
    reopenTicket: builder.mutation({
      query: ({ id, reason, expected_version }) => ({
        url: `/${id}/reopen`,
        method: 'POST',
        body: { reason, expected_version },
      }),
      invalidatesTags: mutationTags,
    }),
    markTicketRead: builder.mutation({
      query: (id) => ({ url: `/${id}/read`, method: 'POST' }),
      invalidatesTags: (_result, _error, id) => [{ type: 'Ticket', id }, 'TicketList'],
    }),
    uploadAttachment: builder.mutation({
      query: ({ id, file, visibility, expected_version }) => {
        const body = new FormData();
        body.append('file', file);
        body.append('visibility', visibility);
        body.append('expected_version', String(expected_version));
        return { url: `/${id}/attachments`, method: 'POST', body };
      },
      invalidatesTags: mutationTags,
    }),
  }),
});

export const {
  useGetTicketsQuery,
  useGetTicketQuery,
  useGetTicketSummaryQuery,
  useGetTicketBoardQuery,
  useGetTicketActivityQuery,
  useGetAssignableUsersQuery,
  useCreateTicketMutation,
  useReplyToTicketMutation,
  useAssignTicketMutation,
  useUpdateTicketMutation,
  useResolveTicketMutation,
  useCloseTicketMutation,
  useReopenTicketMutation,
  useMarkTicketReadMutation,
  useUploadAttachmentMutation,
} = ticketsApi;
