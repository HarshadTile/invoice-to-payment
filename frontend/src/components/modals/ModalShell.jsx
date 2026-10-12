import { useDispatch } from 'react-redux';
import { closeModal } from '../../features/ui/uiSlice';

/** `onClose` is for dialogs a page opens from its own state; without it the shell closes the app-wide modal. */
export default function ModalShell({ title, width = 560, children, foot, onClose }) {
  const dispatch = useDispatch();
  const close = onClose || (() => dispatch(closeModal()));
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal" style={{ width, maxWidth: '92vw' }}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="close-x" aria-label="Close" onClick={close}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}
