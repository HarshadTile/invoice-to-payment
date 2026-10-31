import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, X } from './icons.jsx';

/**
 * Accessible single-select dropdown (button + listbox).
 * options: [{ value, label, count? }] — `value: ''` is treated as the "all" option.
 * Keyboard: Enter/Space/↓ open, ↑/↓ move, Home/End, Enter select, Esc/Tab close.
 * variant="chip": a compact pill with the label inline ("Plant · All") and a clear button once set.
 */
export default function Dropdown({ label, value, options, onChange, ariaLabel, searchPlaceholder, variant }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);
  const listId = useId();
  const chip = variant === 'chip';

  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options[selectedIndex];
  const search = query.trim().toLowerCase();
  const visibleOptions = searchPlaceholder && search
    ? options.filter((option) => option.value === '' || option.label.toLowerCase().includes(search)) : options;

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const openMenu = () => { setQuery(''); setActive(selectedIndex); setOpen(true); };
  const pick = (i) => { if (!visibleOptions[i]) return; onChange(visibleOptions[i].value); setOpen(false); setQuery(''); };

  const onKeyDown = (e) => {
    if (e.target.tagName === 'INPUT' && [' ', 'Home', 'End'].includes(e.key)) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openMenu(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(visibleOptions.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(visibleOptions.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(active); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div className={`dd-field${chip ? ' dd-chip' : ''}`} ref={wrapRef}>
      {label && !chip && <span className="dd-label">{label}</span>}
      <div className="dd">
        <button
          type="button"
          className={`dd-btn${value ? ' has-value' : ''}${open ? ' open' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-label={ariaLabel || label}
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={onKeyDown}
        >
          {chip && label && <span className="dd-chip-label">{label}</span>}
          <span className="dd-value">{chip && !value ? 'All' : selected?.label}</span>
          <ChevronDown size={chip ? 12 : 14} className="dd-chev" />
        </button>
        {chip && value && <button type="button" className="dd-chip-clear" aria-label={`Clear ${label}`}
          onClick={() => onChange('')}><X size={11} /></button>}

        {open && (
          <ul className="dd-menu" role="listbox" id={listId}>
            {searchPlaceholder && <li role="presentation" className="dd-search-row">
              <input autoFocus type="search" className="search-box dd-search-input"
                aria-label={searchPlaceholder} placeholder={searchPlaceholder} value={query}
                onChange={(event) => { setQuery(event.target.value); setActive(0); }} onKeyDown={onKeyDown} />
            </li>}
            {search && !visibleOptions.some((option) => option.value !== '') && <li role="presentation" className="cell-muted" style={{ padding: '0.5rem' }}>No matches found.</li>}
            {visibleOptions.map((o, i) => (
              <li
                key={o.value || 'all'}
                role="option"
                aria-selected={o.value === value}
                className={`dd-opt${o.value === value ? ' selected' : ''}${i === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
              >
                <span>{o.label}</span>
                {o.count !== undefined && <span className="dd-count">{o.count}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
