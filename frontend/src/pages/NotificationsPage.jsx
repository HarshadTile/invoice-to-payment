import { useState } from 'react';
import { useGetNotificationsQuery, useGetUnreadCountQuery, NOTIFICATION_LIVE } from '../features/notifications/notificationsApi';
import { useNotificationActions } from '../features/notifications/useNotificationActions';
import { CheckCircle, Clock, Inbox, MessageSquare, RotateCcw, User } from '../components/common/icons.jsx';
import { NOTIFICATION_DETAIL, NOTIFICATION_TONE, dayLabel, notificationLabel, notificationTime } from '../utils/notifications';

const PAGE = 50;
const MAX = 200; // the server's cap per request

const ICON = {
  TICKET_CREATED: Inbox,
  TICKET_ASSIGNED: User,
  SUPPLIER_REPLIED: MessageSquare,
  STAFF_REPLIED: MessageSquare,
  TICKET_RESOLVED: CheckCircle,
  TICKET_REOPENED: RotateCcw,
  TICKET_CLOSED: CheckCircle,
  TICKET_AUTO_CLOSED: CheckCircle,
  SLA_BREACHED: Clock,
};

/** The full Notifications page. It shares its data with the bell, so reading one updates the other. */
export default function NotificationsPage() {
  const { identity, open, readAll } = useNotificationActions();
  const [limit, setLimit] = useState(PAGE);
  const [tab, setTab] = useState('all');

  const { data: items, isLoading, isFetching, isError, refetch } = useGetNotificationsQuery({ identity, limit }, { ...NOTIFICATION_LIVE, skip: !identity });
  const { data: count } = useGetUnreadCountQuery({ identity }, { ...NOTIFICATION_LIVE, skip: !identity });

  const list = items || [];
  const unread = count?.unread ?? list.filter((n) => !n.read_at).length;
  const shown = tab === 'unread' ? list.filter((n) => !n.read_at) : list;
  const mayHaveMore = list.length >= limit && limit < MAX;

  return (
    <section className="inbox-page">
      <div className="inbox-card">
        <div className="inbox-head">
          <span className="inbox-title">
            <b>Notifications</b>
            <small>{unread ? `${unread} unread` : 'You are all caught up'}</small>
          </span>
          <div className="inbox-actions">
            <div className="view-switch" role="group" aria-label="Show">
              <button type="button" className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}><span>All</span></button>
              <button type="button" className={tab === 'unread' ? 'active' : ''} onClick={() => setTab('unread')}><span>Unread{unread ? ` (${unread})` : ''}</span></button>
            </div>
            <button type="button" className="inbox-markall" onClick={readAll} disabled={!unread}>Mark all read</button>
          </div>
        </div>

        <div className="inbox-list">
          {isLoading && <p className="notification-empty">Loading...</p>}
          {isError && !list.length && (
            <p className="notification-empty">
              Notifications couldn't be loaded. <button type="button" className="notification-retry" onClick={refetch}>Try again</button>
            </p>
          )}
          {!isLoading && !isError && !shown.length && (
            <div className="inbox-empty">
              <span className="inbox-empty-icon"><Inbox size={22} /></span>
              <b>{tab === 'unread' ? 'No unread notifications' : 'No notifications yet'}</b>
              <span>{tab === 'unread' ? 'Everything has been read.' : 'Updates on your queries will appear here.'}</span>
            </div>
          )}
          {shown.map((n) => {
            const tone = NOTIFICATION_TONE[n.type] || 'gray';
            const Icon = ICON[n.type] || Inbox;
            return (
              <button type="button" className={`inbox-row${n.read_at ? '' : ' unread'}`} key={n.id} onClick={() => open(n)}>
                <span className={`inbox-icon ${tone}`}><Icon size={18} /></span>
                <span className="inbox-main">
                  <span className="inbox-line">
                    <b>{notificationLabel(n)}</b>
                    {!n.read_at && <i className="inbox-new" aria-label="Unread">New</i>}
                  </span>
                  {NOTIFICATION_DETAIL[n.type] && <span className="inbox-detail">{NOTIFICATION_DETAIL[n.type]}</span>}
                  <span className="inbox-sub">
                    <span className="inbox-ref">{n.ticket_no || 'Query'}</span>
                    {n.subject && <span className="inbox-subject">{n.subject}</span>}
                  </span>
                </span>
                <span className="inbox-when">
                  <span>{dayLabel(n.created_at)}</span>
                  <small>{notificationTime(n.created_at)}</small>
                </span>
              </button>
            );
          })}
        </div>

        {mayHaveMore && tab === 'all' && (
          <div className="inbox-foot">
            <button type="button" onClick={() => setLimit((v) => Math.min(MAX, v + PAGE))} disabled={isFetching}>
              {isFetching ? 'Loading…' : 'Show older'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
