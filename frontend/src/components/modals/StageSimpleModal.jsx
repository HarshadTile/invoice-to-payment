import { useDispatch } from 'react-redux';
import { CHANNEL_LABEL, STATUS_CHIP } from '../../data/constants';
import { currentStageName, handlerFor, findInvoice } from '../../utils/businessLogic';
import ModalShell from './ModalShell.jsx';
import Badge from '../common/Badge.jsx';
import { closeModal, ensureNavExpanded } from '../../features/ui/uiSlice';
import { useNavigate } from 'react-router-dom';

export default function StageSimpleModal({ ctx }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const inv = findInvoice(ctx.no, ctx.poItem);
  if (!inv) return null;
  const h = handlerFor(inv);

  return (
    <ModalShell
      title={inv.no}
      width={420}
      foot={(
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              dispatch(closeModal());
              dispatch(ensureNavExpanded('channels'));
              navigate(`/app/channel/${inv.channel}`);
            }}
          >
            Open in {CHANNEL_LABEL[inv.channel]} →
          </button>
          <button type="button" className="btn" onClick={() => dispatch(closeModal())}>Close</button>
        </div>
      )}
    >
      <div style={{ textAlign: 'center', padding: '0.375rem 0 0.875rem' }}>
        <div style={{ fontSize: '0.71875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{CHANNEL_LABEL[inv.channel]}</div>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)', marginTop: '0.5rem', lineHeight: 1.4 }}>{currentStageName(inv)}</div>
        <div style={{ marginTop: '0.75rem' }}><Badge tone={STATUS_CHIP[inv.status] || 'gray'}>{inv.status}</Badge></div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.625rem' }}>Handled by <b>{h.approver}</b> · {h.approverEmail}</div>
      </div>
    </ModalShell>
  );
}
