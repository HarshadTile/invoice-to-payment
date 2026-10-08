import { useDispatch } from 'react-redux';
import { runtime } from '../../data/runtime';
import { CHANNEL_LABEL, STATUS_CHIP } from '../../data/constants';
import { currentStageName, handlerFor } from '../../utils/businessLogic';
import ModalShell from './ModalShell.jsx';
import Badge from '../common/Badge.jsx';
import { closeModal, ensureNavExpanded } from '../../features/ui/uiSlice';
import { useNavigate } from 'react-router-dom';

export default function StageSimpleModal({ ctx }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const inv = runtime.invoices.find((i) => i.no === ctx.no);
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
      <div style={{ textAlign: 'center', padding: '6px 0 14px' }}>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{CHANNEL_LABEL[inv.channel]}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginTop: 8, lineHeight: 1.4 }}>{currentStageName(inv)}</div>
        <div style={{ marginTop: 12 }}><Badge tone={STATUS_CHIP[inv.status] || 'gray'}>{inv.status}</Badge></div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>Handled by <b>{h.approver}</b> · {h.approverEmail}</div>
      </div>
    </ModalShell>
  );
}
