import { describe, it, expect } from 'vitest';
import reducer, {
  hydrateTickets, replaceTicket, prependTicket,
  setStatusLocal, postCommentLocal,
} from './ticketsSlice.js';

const base = () => reducer(undefined, hydrateTickets({
  items: [{ id: 'TCK-1', status: 'Open', priority: 'Low', comments: [], activity: [] }],
  seq: 1005,
}));

describe('tickets reducer', () => {
  it('hydrates items and seq', () => {
    const s = base();
    expect(s.items).toHaveLength(1);
    expect(s.seq).toBe(1005);
  });

  it('setStatusLocal updates status and appends an activity line', () => {
    const s = reducer(base(), setStatusLocal({ id: 'TCK-1', status: 'Resolved' }));
    expect(s.items[0].status).toBe('Resolved');
    expect(s.items[0].resolvedDate).toBeTruthy();
    expect(s.items[0].activity.at(-1).text).toMatch(/Resolved/);
  });

  it('postCommentLocal moves an Open ticket to In Progress on a non-supplier reply', () => {
    const s = reducer(base(), postCommentLocal({ id: 'TCK-1', author: 'Accounts', role: 'Accounts', text: 'hi' }));
    expect(s.items[0].status).toBe('In Progress');
    expect(s.items[0].comments).toHaveLength(1);
  });

  it('replaceTicket swaps the server copy in place', () => {
    const s = reducer(base(), replaceTicket({ id: 'TCK-1', status: 'Closed', comments: [], activity: [] }));
    expect(s.items[0].status).toBe('Closed');
  });

  it('prependTicket adds to the front and bumps seq', () => {
    const s = reducer(base(), prependTicket({ ticket: { id: 'TCK-1006', status: 'Open' }, seq: 1006 }));
    expect(s.items[0].id).toBe('TCK-1006');
    expect(s.seq).toBe(1006);
  });
});
