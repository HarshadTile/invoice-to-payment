import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { addRow, updateRow } from '../../features/tables/tablesSlice';
import { closeModal, pushToast } from '../../features/ui/uiSlice';
import ModalShell from './ModalShell.jsx';

function blankRow(cols) {
  return cols.map(() => '');
}

export default function RowFormModal({ ctx }) {
  const dispatch = useDispatch();
  const { tableKey, cols, rows, idx, entityLabel = 'Row' } = ctx;
  const editing = idx != null;
  const [values, setValues] = useState(editing ? [...rows[idx]] : blankRow(cols));

  function setVal(i, v) {
    setValues((prev) => { const next = [...prev]; next[i] = v; return next; });
  }
  async function save() {
    if (editing) await dispatch(updateRow({ key: tableKey, idx, row: values }));
    else await dispatch(addRow({ key: tableKey, row: values }));
    dispatch(closeModal());
    dispatch(pushToast(`${entityLabel} ${editing ? 'updated' : 'added'}.`));
  }

  return (
    <ModalShell
      title={`${editing ? 'Edit' : 'Add'} ${entityLabel}`}
      foot={(
        <>
          <button type="button" className="btn" onClick={() => dispatch(closeModal())}>Cancel</button>
          <button type="button" className="btn primary" onClick={save}>Save Changes</button>
        </>
      )}
    >
      {cols.map((c, i) => (
        <div className="form-field" key={c}>
          <label>{c}</label>
          <input
            type={/date/i.test(c) ? 'date' : 'text'}
            value={values[i] ?? ''}
            onChange={(e) => setVal(i, e.target.value)}
          />
        </div>
      ))}
    </ModalShell>
  );
}
