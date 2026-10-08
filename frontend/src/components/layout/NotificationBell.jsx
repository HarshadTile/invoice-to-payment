import { useEffect, useRef, useState } from 'react';
import { useGetNotificationsQuery, useGetUnreadCountQuery, NOTIFICATION_LIVE } from '../../features/notifications/notificationsApi';
import { useNotificationActions } from '../../features/notifications/useNotificationActions';
import { notificationDate, notificationLabel } from '../../utils/notifications';
import { Bell } from '../common/icons.jsx';

const MENU_LIMIT = 30;

/** The bell in the top bar: an exact unread badge plus a dropdown of the latest notifications. */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const { identity, open: openNotification, readAll } = useNotificationActions();
  const skip = !identity;

  const { data: count, isError: countFailed } = useGetUnreadCountQuery({ identity }, { ...NOTIFICATION_LIVE, skip });
  const { data: items, isLoading, isError, refetch } = useGetNotificationsQuery({ identity, limit: MENU_LIMIT }, { ...NOTIFICATION_LIVE, skip: skip || !open });
  const unread = count?.unread ?? 0;

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false); };
    const escape = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const list = items || [];
  return (
    <div className="notification-menu-wrap" ref={wrapRef}>
      <button
        type="button" className="icon-btn notification-button"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-haspopup="dialog" aria-expanded={open}
        title={countFailed ? "Notifications couldn't be refreshed" : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={18} />
        {unread > 0 && <span className="notification-count">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="notification-menu" role="dialog" aria-label="Notifications">
          <div className="notification-menu-head">
            <b>Notifications</b>
            <button type="button" onClick={readAll} disabled={!unread}>Mark all read</button>
          </div>
          <div className="notification-menu-list">
            {isLoading && <p className="notification-empty">Loading...</p>}
            {isError && (
              <p className="notification-empty">
                Couldn't load notifications. <button type="button" className="notification-retry" onClick={refetch}>Try again</button>
              </p>
            )}
            {!isLoading && !isError && !list.length && <p className="notification-empty">No notifications.</p>}
            {list.map((item) => (
              <button type="button" className={`notification-item${item.read_at ? '' : ' unread'}`} key={item.id} onClick={() => openNotification(item, () => setOpen(false))}>
                <span className="notification-item-dot" />
                <span><b>{notificationLabel(item)}</b><small>{item.ticket_no || 'Query'}{item.subject ? ` - ${item.subject}` : ''}</small><time>{notificationDate(item.created_at)}</time></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
