import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { closeModal, pushToast } from '../../features/ui/uiSlice';
import ModalShell from './ModalShell.jsx';

export default function ImportModal() {
  const dispatch = useDispatch();
  const [status, setStatus] = useState('idle'); // idle | validating | done

  function simulate() {
    setStatus('validating');
    setTimeout(() => setStatus('done'), 900);
  }
  function commit() {
    dispatch(closeModal());
    dispatch(pushToast('Valid data imported successfully.'));
  }

  return (
    <ModalShell
      title="Import Data"
      foot={(
        <>
          <button type="button" className="btn" onClick={() => dispatch(closeModal())}>Cancel</button>
          <button type="button" className="btn primary" disabled={status !== 'done'} onClick={commit}>Import Valid Data</button>
        </>
      )}
    >
      <button type="button" className="dropzone" onClick={simulate} style={{ width: '100%' }}>
        {status === 'idle' && <>☁ Click to upload or drag and drop<br /><span style={{ fontSize: 11.5 }}>Supports .xlsx files up to 25MB</span></>}
        {status === 'validating' && <>⏳ Validating file...</>}
        {status === 'done' && <>✓ File validated</>}
      </button>
      {status === 'done' && (
        <div style={{ marginTop: 16 }}>
          <div className="validation-row"><span>Sheet: Vendor Code Mapping</span><span className="chip green">Valid</span></div>
          <div className="validation-row" style={{ display: 'block' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Sheet: Invoice Log</span><span className="chip amber">Needs Review</span></div>
            <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6, paddingLeft: 4 }}>Row 6: "PO No" is required</div>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
