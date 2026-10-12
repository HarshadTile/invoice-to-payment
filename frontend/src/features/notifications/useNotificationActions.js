import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { pushToast } from '../ui/uiSlice';
import { useMarkAllNotificationsReadMutation, useMarkNotificationReadMutation } from './notificationsApi';

/** Who is signed in, as a cache key: notifications are per person and must never carry over to the next login. */
export function useNotificationIdentity() {
  return useSelector((s) => {
    const { authType, id, supplierLoginVcode } = s.auth;
    if (authType === 'supplier') return supplierLoginVcode ? `supplier:${supplierLoginVcode}` : '';
    return id ? `user:${id}` : '';
  });
}

/** Open a notification (mark it read, go to its query) and mark everything read, with errors shown to the user. */
export function useNotificationActions() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const identity = useNotificationIdentity();
  const supplier = useSelector((s) => s.auth.authType === 'supplier');
  const [markRead] = useMarkNotificationReadMutation();
  const [markAll] = useMarkAllNotificationsReadMutation();

  const open = useCallback(async (item, afterOpen) => {
    if (!item.read_at) {
      markRead({ id: item.id, identity }).unwrap().catch(() => dispatch(pushToast("Couldn't mark that notification as read.")));
    }
    if (afterOpen) afterOpen();
    // `from` lets the query's Back button return to this page instead of the queries list
    if (item.ticket_id) navigate(supplier ? `/supplier/tickets/${item.ticket_id}` : `/app/inquiry-desk/${item.ticket_id}`, { state: { from: location.pathname + location.search } });
  }, [dispatch, identity, location.pathname, location.search, markRead, navigate, supplier]);

  const readAll = useCallback(
    () => markAll({ identity }).unwrap().catch(() => dispatch(pushToast("Couldn't mark notifications as read."))),
    [dispatch, identity, markAll],
  );

  return { identity, open, readAll };
}
