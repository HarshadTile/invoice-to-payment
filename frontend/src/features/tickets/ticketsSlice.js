import { createSlice } from '@reduxjs/toolkit';
import { APP_NOW } from '../../data/constants';
import { api } from '../../api/client';

function today() {
  return new Date(APP_NOW).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function logActivity(t, text) {
  t.activity = t.activity || [];
  t.activity.push({ date: today(), text });
}

// Tickets are loaded from the API after login (see hydrateThunks.loadBootstrap).
const initialState = {
  items: [],
  seq: 1005,
};

const ticketsSlice = createSlice({
  name: 'tickets',
  initialState,
  reducers: {
    hydrateTickets(state, action) {
      state.items = action.payload.items || [];
      if (action.payload.seq != null) state.seq = action.payload.seq;
    },
    // Replace one ticket in place with the server's authoritative copy.
    replaceTicket(state, action) {
      const next = action.payload;
      const i = state.items.findIndex((x) => x.id === next.id);
      if (i >= 0) state.items[i] = next;
      else state.items.unshift(next);
    },
    prependTicket(state, action) {
      state.items.unshift(action.payload.ticket);
      if (action.payload.seq != null) state.seq = action.payload.seq;
    },

    // ---- optimistic local mutations (also used directly by unit tests) ----
    submitTicketLocal(state, action) {
      const { no, category, priority, desc, raisedBy } = action.payload;
      state.seq += 1;
      const id = 'TCK-' + state.seq;
      state.items.unshift({
        id, no, category, desc: desc || 'No description provided.', status: 'Open',
        priority: priority || 'Medium', assignee: 'MDE Invoice Team', raisedBy,
        raisedDate: today(), slaHours: 24, comments: [],
        activity: [{ date: today(), text: `Ticket created by ${raisedBy}, priority set to ${priority || 'Medium'}, assigned to MDE Invoice Team.` }],
      });
    },
    postCommentLocal(state, action) {
      const { id, author, role, text } = action.payload;
      const t = state.items.find((x) => x.id === id);
      if (!t) return;
      t.comments = t.comments || [];
      t.comments.push({ author, role, date: today(), text });
      logActivity(t, `Comment added by ${author}${role ? ` (${role})` : ''}.`);
      if (role === 'Supplier' && t.status === 'Resolved') {
        t.status = 'In Progress';
        t.resolvedDate = null;
        logActivity(t, 'Reopened to In Progress after a supplier reply.');
      } else if (role !== 'Supplier' && t.status === 'Open') {
        t.status = 'In Progress';
        logActivity(t, 'Status changed to In Progress.');
      }
    },
    setStatusLocal(state, action) {
      const { id, status } = action.payload;
      const t = state.items.find((x) => x.id === id);
      if (!t || t.status === status) return;
      t.status = status;
      if (status === 'Resolved') t.resolvedDate = today();
      logActivity(t, `Status changed to ${status}.`);
    },
    moveStatusLocal(state, action) {
      const { id, status } = action.payload;
      const t = state.items.find((x) => x.id === id);
      if (!t || t.status === status) return;
      t.status = status;
      if (status === 'Resolved') t.resolvedDate = today();
      logActivity(t, `Status changed to ${status} (moved on board).`);
    },
    setPriorityLocal(state, action) {
      const { id, priority } = action.payload;
      const t = state.items.find((x) => x.id === id);
      if (!t) return;
      const old = t.priority;
      t.priority = priority;
      logActivity(t, `Priority changed from ${old} to ${priority}.`);
    },
    setAssigneeLocal(state, action) {
      const { id, assignee } = action.payload;
      const t = state.items.find((x) => x.id === id);
      if (!t) return;
      const old = t.assignee;
      t.assignee = assignee;
      logActivity(t, `Reassigned from ${old} to ${assignee}.`);
    },
  },
});

export const {
  hydrateTickets, replaceTicket, prependTicket,
  submitTicketLocal, postCommentLocal, setStatusLocal, moveStatusLocal,
  setPriorityLocal, setAssigneeLocal,
} = ticketsSlice.actions;
export default ticketsSlice.reducer;

/* ---- write-through thunks (public API used by components) ---- */

export const submitTicket = (payload) => async (dispatch) => {
  const { ticket, seq } = await api.post('/v1/tickets', payload);
  dispatch(prependTicket({ ticket, seq }));
  return ticket;
};

// Only overwrite the optimistic copy when the server actually returned a ticket.
function reconcile(dispatch, updated) {
  if (updated && updated.id) dispatch(replaceTicket(updated));
}

export const postComment = (payload) => async (dispatch) => {
  dispatch(postCommentLocal(payload));
  const updated = await api.post(`/v1/tickets/${payload.id}/comments`, {
    author: payload.author, role: payload.role, text: payload.text, date: today(),
  });
  reconcile(dispatch, updated);
  return updated;
};

function statusThunk(localAction, boardMove) {
  return ({ id, status }) => async (dispatch) => {
    dispatch(localAction({ id, status }));
    const suffix = boardMove ? ' (moved on board)' : '';
    const body = { status, activity: [{ date: today(), text: `Status changed to ${status}${suffix}.` }] };
    if (status === 'Resolved') body.resolvedDate = today();
    const updated = await api.patch(`/tickets/${id}`, body);
    reconcile(dispatch, updated);
    return updated;
  };
}

export const setStatus = statusThunk(setStatusLocal, false);
export const moveStatus = statusThunk(moveStatusLocal, true);

export const setPriority = ({ id, priority }) => async (dispatch, getState) => {
  const old = getState().tickets.items.find((t) => t.id === id)?.priority;
  dispatch(setPriorityLocal({ id, priority }));
  const updated = await api.patch(`/tickets/${id}`, {
    priority,
    activity: [{ date: today(), text: `Priority changed from ${old} to ${priority}.` }],
  });
  reconcile(dispatch, updated);
  return updated;
};

export const setAssignee = ({ id, assignee }) => async (dispatch, getState) => {
  const old = getState().tickets.items.find((t) => t.id === id)?.assignee;
  dispatch(setAssigneeLocal({ id, assignee }));
  const updated = await api.patch(`/tickets/${id}`, {
    assignee,
    activity: [{ date: today(), text: `Reassigned from ${old} to ${assignee}.` }],
  });
  reconcile(dispatch, updated);
  return updated;
};

