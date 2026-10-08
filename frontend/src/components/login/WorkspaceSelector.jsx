import { BuildingIcon, CaretIcon } from './icons.jsx';

/* Per-channel login options. "Internal Team" bundle is removed —
   each channel is now its own login. Manual has no own login. */
const OPTIONS = [
  { value: 'all',        label: 'All Channels — HQ / Admin' },
  { value: 'msetuSrm',  label: 'Msetu / SRM' },
  { value: 'poPortal',  label: 'PO Portal' },
  { value: 'mfoxPortal', label: 'MFOX Portal' },
];

/** Portal / Team picker (native select for reliability + a11y). Controlled. */
export default function WorkspaceSelector({ id = 'lgn-portal', value, onChange }) {
  return (
    <div className="lgn-field">
      <label htmlFor={id}>Portal / Team</label>
      <div className="lgn-input">
        <BuildingIcon className="lgn-ic" />
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <CaretIcon className="lgn-caret" />
      </div>
    </div>
  );
}
