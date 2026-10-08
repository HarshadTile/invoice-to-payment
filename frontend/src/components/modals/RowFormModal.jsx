import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { addRow, updateRow } from '../../features/tables/tablesSlice';
import { closeModal, pushToast } from '../../features/ui/uiSlice';
import ModalShell from './ModalShell.jsx';

const TABLE_CONFIG = {
  'settings-users': {
    defaults: {
      Status: 'Active',
    },
    fields: {
      Role: ['Admin', 'MDE Invoice Team', 'Approver', 'Accounts', 'Viewer'],
      Status: ['Active', 'Inactive'],
    },
  },
};

function blankRow(tableKey, cols) {
  const defaults = TABLE_CONFIG[tableKey]?.defaults || {};
  return cols.map((col) => defaults[col] || '');
}

export default function RowFormModal({ ctx }) {
  const dispatch = useDispatch();
  const { tableKey, cols, rows, idx } = ctx;
  const editing = idx != null;
  const config = TABLE_CONFIG[tableKey] || {};
  const [values, setValues] = useState(editing ? [...rows[idx]] : blankRow(tableKey, cols));

  function setVal(i, v) {
    setValues((prev) => { const next = [...prev]; next[i] = v; return next; });
  }
  async function save() {
    if (editing) await dispatch(updateRow({ key: tableKey, idx, row: values }));
    else await dispatch(addRow({ key: tableKey, row: values }));
    dispatch(closeModal());
    const userName = values[0] || 'User';
    const message = tableKey === 'settings-users'
      ? `${userName} ${editing ? 'updated' : 'added'} successfully.`
      : 'Row saved.';
    dispatch(pushToast(message));
  }

  return (
    <ModalShell
      title={`${editing ? 'Edit' : 'Add'} ${tableKey.replace(/-/g, ' ')} Entry`}
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
          {config.fields?.[c] ? (
            <select value={values[i] ?? ''} onChange={(e) => setVal(i, e.target.value)}>
              {config.fields[c].map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          ) : (
            <input value={values[i] ?? ''} onChange={(e) => setVal(i, e.target.value)} />
          )}
        </div>
      ))}
    </ModalShell>
  );
}
