import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { dismissToast } from '../../features/ui/uiSlice';

export default function ToastStack() {
  const toasts = useSelector((s) => s.ui.toasts);
  const dispatch = useDispatch();

  useEffect(() => {
    if (!toasts.length) return;
    const id = toasts[0].id;
    const timer = setTimeout(() => dispatch(dismissToast(id)), 2600);
    return () => clearTimeout(timer);
  }, [toasts, dispatch]);

  if (!toasts.length) return null;
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>{t.msg}</div>
      ))}
    </div>
  );
}
