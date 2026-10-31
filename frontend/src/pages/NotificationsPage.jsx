import { useMemo, useState } from 'react';
import { useGetNotificationsQuery, useGetUnreadCountQuery, NOTIFICATION_LIVE } from '../features/notifications/notificationsApi';
import { useNotificationActions } from '../features/notifications/useNotificationActions';
import { CheckCircle, Clock, Inbox, Mail, MessageSquare, RotateCcw, Search, Send, User } from '../components/common/icons.jsx';
import { NOTIFICATION_DETAIL, NOTIFICATION_TONE, dayLabel, notificationLabel, notificationTime } from '../utils/notifications';

// One icon per event, in the event's tone, so the list reads at a glance.
const NOTIFICATION_ICON = {
  TICKET_CREATED: MessageSquare, TICKET_ASSIGNED: User, SUPPLIER_REPLIED: Mail, STAFF_REPLIED: Send,
  TICKET_RESOLVED: CheckCircle, TICKET_REOPENED: RotateCcw, TICKET_CLOSED: CheckCircle,
  TICKET_AUTO_CLOSED: CheckCircle, SLA_BREACHED: Clock,
};

const PAGE = 50;
const MAX = 200; // the server's cap per request

/** The full Notifications page: the same rows as the bell menu, in a centered card. It shares its
 *  data with the bell, so reading one updates the other. */
export default function NotificationsPage() {
  const { identity, open, readAll } = useNotificationActions();
  const [limit, setLimit] = useState(PAGE);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');

  const { data: items, isLoading, isFetching, isError, refetch } = useGetNotificationsQuery({ identity, limit }, { ...NOTIFICATION_LIVE, skip: !identity });
  const { data: count } = useGetUnreadCountQuery({ identity }, { ...NOTIFICATION_LIVE, skip: !identity });

  const list = useMemo(() => items || [], [items]);
  const unread = count?.unread ?? list.filter((n) => !n.read_at).length;

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return list.filter((n) => (
      (tab === 'all' || !n.read_at)
      && (!needle || [notificationLabel(n), n.ticket_no, n.subject].some((v) => String(v || '').toLowerCase().includes(needle)))
    ));
  }, [list, tab, search]);

  const mayHaveMore = list.length >= limit && limit < MAX;
  const filtering = tab !== 'all' || search;

  return (
    <section className="inbox-page dash">
      <div className="inbox-card">
        <div className="inbox-head">
          <span className="inbox-title">
            <b>Notifications {unread > 0 && <span className="inbox-count">{unread} unread</span>}</b>
            <small>{unread ? 'Open a notification to mark it read' : 'You are all caught up'}</small>
          </span>
          <button type="button" className="inbox-markall" onClick={readAll} disabled={!unread}>Mark all read</button>
        </div>

        <div className="inbox-toolbar">
          <div className="view-switch" role="group" aria-label="Show">
            <button type="button" className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}><span>All</span></button>
            <button type="button" className={tab === 'unread' ? 'active' : ''} onClick={() => setTab('unread')}><span>Unread{unread ? ` (${unread})` : ''}</span></button>
          </div>
          <label className="ticket-search">
            <Search />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by query no or subject" aria-label="Search notifications" />
          </label>
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
              <b>{filtering ? 'No notifications match' : 'No notifications yet'}</b>
              <span>{tab === 'unread' && !search ? 'Everything has been read.' : filtering ? 'Try clearing the filters.' : 'Updates on your queries will appear here.'}</span>
            </div>
          )}
          {shown.length > 0 && (
            <div className="inbox-cols" aria-hidden="true"><span /><span>Event</span><span>Query</span><span>Received</span></div>
          )}
          {shown.map((n) => {
            const Icon = NOTIFICATION_ICON[n.type] || Inbox;
            return (
            <button type="button" className={`inbox-row${n.read_at ? '' : ' unread'}`} key={n.id} onClick={() => open(n)}>
              <span className={`inbox-ic ${NOTIFICATION_TONE[n.type] || 'gray'}`} aria-hidden={n.read_at ? true : undefined}>
                <Icon size={15} />
                <span className="inbox-dot" aria-label={n.read_at ? undefined : 'Unread'} />
              </span>
              <span className="inbox-event">
                <b>{notificationLabel(n)}</b>
                {NOTIFICATION_DETAIL[n.type] && <small>{NOTIFICATION_DETAIL[n.type]}</small>}
              </span>
              <span className="inbox-query">
                <span className="inbox-ref">{n.ticket_no || 'Query'}</span>
                {n.subject && <span className="inbox-subject">{n.subject}</span>}
              </span>
              <time className="inbox-when" dateTime={n.created_at}>
                <span>{dayLabel(n.created_at)}</span>
                <small>{notificationTime(n.created_at)}</small>
              </time>
            </button>
            );
          })}
        </div>

        {mayHaveMore && tab === 'all' && !search && (
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
