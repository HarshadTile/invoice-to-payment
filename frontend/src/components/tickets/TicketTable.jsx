import { useDispatch } from 'react-redux';
import { CHANNEL_LABEL, TICKET_STATUS_CHIP } from '../../data/constants';
import { ticketInvoice, currentHandlerFor, ticketBreached } from '../../utils/businessLogic';
import { openModal } from '../../features/ui/uiSlice';
import Badge from '../common/Badge.jsx';

export default function TicketTable({ tickets }) {
  const dispatch = useDispatch();
  if (!tickets.length) return <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '16px 0' }}>No queries match this filter.</p>;

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Ticket</th><th>Invoice</th><th>Channel</th><th>Vendor Code</th><th>PO No</th>
            <th>Category</th><th>Raised By</th><th>Raised</th><th>Owner</th><th>Last Message</th><th>SLA</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => {
            const inv = ticketInvoice(t);
            const owner = currentHandlerFor(inv);
            const breached = ticketBreached(t);
            const comments = t.comments || [];
            const last = comments.length ? comments[comments.length - 1] : null;
            return (
              <tr key={t.id}>
                <td><button type="button" className="link-hero" onClick={() => dispatch(openModal({ kind: 'ticketDetail', ctx: { id: t.id } }))}>{t.id}</button></td>
                <td>{t.no}</td>
                <td>{CHANNEL_LABEL[inv.channel]}</td>
                <td className="mono">{inv.vcode}</td>
                <td>{inv.po}</td>
                <td>{t.category}</td>
                <td>{t.raisedBy}</td>
                <td>{t.raisedDate}</td>
                <td>{owner.name}</td>
                <td>
                  {last ? (
                    <>
                      <div style={{ fontSize: 11.5 }}><b>{last.author}</b>{last.role ? ` · ${last.role}` : ''}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={last.text}>{last.text}</div>
                    </>
                  ) : <span style={{ fontSize: 11.5, color: '#CBD5E1' }}>No replies yet</span>}
                </td>
                <td>{breached ? <Badge tone="red">Breached</Badge> : <Badge tone="gray">{t.slaHours}h</Badge>}</td>
                <td><Badge tone={TICKET_STATUS_CHIP[t.status]}>{t.status}</Badge></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
