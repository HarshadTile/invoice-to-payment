import { useState } from 'react';

/** Donut (SVG arcs) + inline legend. Hovering a slice or a legend row shows a
 *  detail tip inside the card. */
export default function DonutChart({ segments, total }) {
  const [hi, setHi] = useState(null);
  const sum = segments.reduce((s, x) => s + x.value, 0) || 1;
  const R = 42;
  const C = 2 * Math.PI * R;
  const SW = 13;

  const offsets = segments.reduce((acc, s) => {
    acc.push(acc[acc.length - 1] + (s.value / sum) * C);
    return acc;
  }, [0]);
  const arcs = segments.map((s, i) => {
    const dash = Math.max((s.value / sum) * C - 1.4, 0.4);
    return (
      <circle
        key={s.key}
        cx="50" cy="50" r={R} fill="none"
        stroke={s.color}
        strokeWidth={hi === i ? SW + 3 : SW}
        strokeDasharray={`${dash} ${C - dash}`}
        strokeDashoffset={-offsets[i]}
        transform="rotate(-90 50 50)"
        onMouseEnter={() => setHi(i)}
        onMouseLeave={() => setHi(null)}
        style={{ transition: 'stroke-width .12s ease' }}
      />
    );
  });

  const tip = hi != null ? segments[hi] : null;

  return (
    <div className="donut-wrap">
      <div className="donut-fig">
        <svg viewBox="0 0 100 100" className="donut-svg" role="img" aria-label={`${total} invoices by channel`}>
          <circle cx="50" cy="50" r={R} fill="none" stroke="#EEEEF1" strokeWidth={SW} />
          {arcs}
        </svg>
        <span className="donut-center">
          <span className="donut-num">{total}</span>
          <span className="donut-lbl">Total</span>
        </span>
      </div>

      {tip && (
        <div className="chart-tip" role="status">
          <span className="chart-tip-dot" style={{ background: tip.color }} />
          <b>{tip.label}</b>
          <span>{tip.value} invoices · {Math.round((tip.value / sum) * 100)}%</span>
        </div>
      )}

      <div className="donut-legend">
        {segments.map((s, i) => (
          <div
            key={s.key}
            className={`legend-row${hi === i ? ' hi' : ''}`}
            onMouseEnter={() => setHi(i)}
            onMouseLeave={() => setHi(null)}
            title={`${s.value} invoices (${Math.round((s.value / sum) * 100)}%)`}
          >
            <span className="legend-dot" style={{ background: s.color }} />
            <span className="legend-name">{s.label}</span>
            <span className="legend-val">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
