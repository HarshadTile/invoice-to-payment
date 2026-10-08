import { BuildingIcon, CaretIcon } from './icons.jsx';

/* Per-channel login options. An Admin account (channel_scope "all") may pick any of these
   to preview that channel's view; an account locked to one portal (Settings > Users) can
   only ever land on its own — the backend enforces that regardless of what's picked here. */
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
