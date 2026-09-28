import { useState } from 'react';

/** Horizontal bar list. Hovering a row shows a detail tip inside the card. */
export default function BarChart({ bars, onBarClick, activeKey }) {
  const [hi, setHi] = useState(null);
  const max = Math.max(...bars.map((b) => b.value), 1);
  const total = bars.reduce((s, b) => s + b.value, 0) || 1;
  const tip = hi != null ? bars[hi] : null;

  return (
    <div className="hbar-list">
      {tip && (
        <div className="chart-tip" role="status">
          <span className="chart-tip-dot" style={{ background: tip.color }} />
          <b>{tip.label}</b>
          <span>{tip.value} invoices · {Math.round((tip.value / total) * 100)}% of total</span>
        </div>
      )}
      {bars.map((b, i) => {
        const w = Math.max(Math.round((b.value / max) * 100), 2);
        const share = Math.round((b.value / total) * 100);
        const active = activeKey === b.key;
        return (
          <button
            type="button"
            key={b.key}
            className={`hbar-row${active ? ' active' : ''}${hi === i ? ' hi' : ''}`}
            onMouseEnter={() => setHi(i)}
            onMouseLeave={() => setHi(null)}
            onFocus={() => setHi(i)}
            onBlur={() => setHi(null)}
            onClick={onBarClick ? () => onBarClick(b.key) : undefined}
            title={`${b.value} invoices (${share}% of total)`}
          >
            <span className="hbar-label">
              {b.color && <span className="hbar-dot" style={{ background: b.color }} />}
              {b.label}
            </span>
            <span className="hbar-track">
              <span className="hbar-fill" style={{ width: `${w}%`, background: b.color || undefined }} />
            </span>
            <span className="hbar-val">{b.value} <span className="hbar-pct">· {share}%</span></span>
          </button>
        );
      })}
    </div>
  );
}
