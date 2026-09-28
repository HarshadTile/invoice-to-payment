import { useDispatch } from 'react-redux';
import { closeModal } from '../../features/ui/uiSlice';

export default function ModalShell({ title, width = 560, children, foot }) {
  const dispatch = useDispatch();
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) dispatch(closeModal()); }}>
      <div className="modal" style={{ width, maxWidth: '92vw' }}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="close-x" onClick={() => dispatch(closeModal())}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}
