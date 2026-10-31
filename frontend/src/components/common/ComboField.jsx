import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from './icons.jsx';

const SHOWN = 60;

/**
 * A labelled text field that shows the current choice and, when focused, becomes a search box with
 * a list underneath. options: [{ value, label, sub?, search? }] — `value: ''` is the "all" choice.
 * Typing matches the label, the sub-line and `search`; ↑/↓ move, Enter picks, Esc / outside click close.
 */
export default function ComboField({ label, value, display, options, onSelect, placeholder, className = '' }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.value === '' || `${o.label} ${o.sub || ''} ${o.search || ''}`.toLowerCase().includes(q));
  }, [options, query]);
  const shown = matches.slice(0, SHOWN);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => { if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const pick = (option) => {
    if (!option) return;
    onSelect(option.value);
    setOpen(false);
    inputRef.current?.blur();
  };
  const onKeyDown = (event) => {
    if (!open && ['ArrowDown', 'Enter'].includes(event.key)) { setOpen(true); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(shown.length - 1, i + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (event.key === 'Enter') { event.preventDefault(); pick(shown[active]); }
    else if (event.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
  };

  return (
    <div className={`combo-field ${className}`.trim()} ref={wrapRef}>
      <label htmlFor={id}>{label}</label>
      <div className={`combo-control${open ? ' open' : ''}`}>
        <input
          id={id} ref={inputRef} role="combobox" autoComplete="off"
          aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
          value={open ? query : display ?? value}
          placeholder={open ? placeholder : undefined}
          title={display ?? value}
          onFocus={() => { setQuery(''); setActive(0); setOpen(true); }}
          onChange={(event) => { setQuery(event.target.value); setActive(0); }}
          onKeyDown={onKeyDown}
        />
        <ChevronDown size={14} className="combo-chev" aria-hidden="true" />
      </div>
      {open && (
        <ul className="combo-menu" role="listbox" id={`${id}-list`}>
          {shown.map((o, i) => (
            <li
              key={o.value || '__all'} role="option" aria-selected={o.value === value}
              className={`combo-opt${o.value === value ? ' selected' : ''}${i === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(i)} onMouseDown={(event) => event.preventDefault()} onClick={() => pick(o)}
            >
              <span className="combo-opt-label">{o.label}</span>
              {o.sub && <span className="combo-opt-sub">{o.sub}</span>}
            </li>
          ))}
          {!matches.some((o) => o.value !== '') && <li className="combo-empty" role="presentation">No matches</li>}
          {matches.length > SHOWN && <li className="combo-empty" role="presentation">Showing {SHOWN} of {matches.length} — type to narrow</li>}
        </ul>
      )}
    </div>
  );
}
