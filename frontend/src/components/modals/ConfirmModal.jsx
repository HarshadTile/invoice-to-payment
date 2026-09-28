import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { deleteRow } from '../../features/tables/tablesSlice';
import { logoutThunk } from '../../features/bootstrap/hydrateThunks';
import { closeModal, pushToast } from '../../features/ui/uiSlice';
import ModalShell from './ModalShell.jsx';

export default function ConfirmModal({ ctx }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const {
    title = 'Confirm Action',
    message = 'Are you sure you want to continue?',
    confirmLabel = 'Confirm',
    tone = 'danger',
    action,
  } = ctx || {};

  async function confirm() {
    if (action?.type === 'deleteRow') {
      await dispatch(deleteRow(action.payload));
      dispatch(pushToast(action.success || 'Row deleted.'));
    }

    if (action?.type === 'logout') {
      await dispatch(logoutThunk());
      dispatch(pushToast('Signed out.'));
      navigate('/login');
    }

    dispatch(closeModal());
  }

  return (
    <ModalShell
      title={title}
      width={440}
      foot={(
        <>
          <button type="button" className="btn" onClick={() => dispatch(closeModal())}>Cancel</button>
          <button type="button" className={`btn ${tone}`} onClick={confirm}>{confirmLabel}</button>
        </>
      )}
    >
      <p className="modal-copy">{message}</p>
    </ModalShell>
  );
}
