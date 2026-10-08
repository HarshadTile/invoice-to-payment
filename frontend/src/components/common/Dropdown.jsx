import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from './icons.jsx';

/**
 * Accessible single-select dropdown (button + listbox).
 * options: [{ value, label, count? }] — `value: ''` is treated as the "all" option.
 * Keyboard: Enter/Space/↓ open, ↑/↓ move, Home/End, Enter select, Esc/Tab close.
 */
export default function Dropdown({ label, value, options, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const listId = useId();

  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const openMenu = () => { setActive(selectedIndex); setOpen(true); };
  const pick = (i) => { onChange(options[i].value); setOpen(false); };

  const onKeyDown = (e) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openMenu(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(active); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div className="dd-field" ref={wrapRef}>
      {label && <span className="dd-label">{label}</span>}
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
          <span className="dd-value">{selected?.label}</span>
          <ChevronDown size={14} className="dd-chev" />
        </button>

        {open && (
          <ul className="dd-menu" role="listbox" id={listId}>
            {options.map((o, i) => (
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
