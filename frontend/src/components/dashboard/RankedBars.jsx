import { useState } from 'react';
import { formatCount, formatShare } from '../../features/invoices/dashboardMetrics';

/**
 * Horizontal bars on one baseline: [{ key, label, count, color? }]. The value and share are
 * printed at each bar's end, so nothing is hover-only; rows are buttons when `onPick` is given.
 * `total` is what the shares are taken of (defaults to the bars' sum).
 */
export default function RankedBars({ rows, total, onPick, color = '#C4122E', pickHint = 'open in Search' }) {
  const [hi, setHi] = useState(null);
  const max = Math.max(...rows.map((r) => r.count), 1);
  const whole = total ?? rows.reduce((sum, r) => sum + r.count, 0);
  const Row = onPick ? 'button' : 'div';
  return (
    <div className="rbar-list">
      {rows.map((r) => (
        <Row
          key={r.key} type={onPick ? 'button' : undefined}
          className={`rbar-row${hi === r.key ? ' hi' : ''}${onPick ? ' clickable' : ''}`}
          onClick={onPick ? () => onPick(r.key) : undefined}
          onMouseEnter={() => setHi(r.key)} onMouseLeave={() => setHi(null)}
          aria-label={onPick ? `${r.label}: ${formatCount(r.count)} invoices, ${pickHint}` : undefined}
        >
          <span className="rbar-label" title={r.label}>{r.label}</span>
          <span className="rbar-track">
            <span className="rbar-fill" style={{ width: `${r.count ? Math.max((r.count / max) * 100, 1.5) : 0}%`, background: r.color || color }} />
          </span>
          <span className="rbar-val">{formatCount(r.count)}<small>{formatShare(r.count, whole)}</small></span>
        </Row>
      ))}
    </div>
  );
}
