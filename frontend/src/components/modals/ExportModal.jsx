import { useDispatch } from 'react-redux';
import { downloadCSV } from '../../utils/businessLogic';
import { closeModal, pushToast } from '../../features/ui/uiSlice';
import ModalShell from './ModalShell.jsx';

export default function ExportModal({ ctx }) {
  const dispatch = useDispatch();
  const { cols, rows, label } = ctx;
  const preview = rows.slice(0, 5);

  function download() {
    downloadCSV(label, cols, rows);
    dispatch(pushToast('Export downloaded.'));
    dispatch(closeModal());
  }

  return (
    <ModalShell
      title={`Export Preview: ${label}`}
      foot={(
        <>
          <button type="button" className="btn" onClick={() => dispatch(closeModal())}>Cancel</button>
          <button type="button" className="btn primary" onClick={download}>⬇ Download Excel</button>
        </>
      )}
    >
      <div className="table-scroll">
        <table>
          <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {preview.map((r, i) => <tr key={i}>{r.map((c, ci) => <td key={ci}>{c}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>{rows.length} total rows will be exported.</p>
    </ModalShell>
  );
}
