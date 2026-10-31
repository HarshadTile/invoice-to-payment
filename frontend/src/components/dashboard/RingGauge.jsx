import { useId } from 'react';
import { formatCount, formatShare } from '../../features/invoices/dashboardMetrics';

/**
 * One part of a whole as a ring: the invoice count in the centre, the name, share and value
 * below. The arc runs through `shades` (light → deep red) as a gradient.
 */
export default function RingGauge({ label, part, whole, sub, shades = ['#E8909C', '#9E0E24'] }) {
  const id = useId();
  const R = 40;
  const C = 2 * Math.PI * R;
  const shareText = formatShare(part, whole);
  const length = whole ? (part / whole) * C : 0;
  return (
    <div className="ring-gauge">
      <div className="ring-fig">
        <svg viewBox="0 0 100 100" className="ring-svg" role="img" aria-label={`${label}: ${formatCount(part)} invoices, ${shareText} of invoices`}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={shades[0]} />
              <stop offset="100%" stopColor={shades[1]} />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r={R} fill="none" stroke="#F8E8EB" strokeWidth="9" />
          {length > 0 && (
            <circle cx="50" cy="50" r={R} fill="none" stroke={`url(#${id})`} strokeWidth="9" strokeLinecap="round"
              strokeDasharray={`${Math.max(length, 0.5)} ${C}`} transform="rotate(-90 50 50)" className="ring-arc" />
          )}
        </svg>
        <span className="ring-center">
          <b>{formatCount(part)}</b>
          <small>invoices</small>
        </span>
      </div>
      <span className="ring-label"><i style={{ background: `linear-gradient(135deg, ${shades[0]}, ${shades[1]})` }} />{label}</span>
      <span className="ring-share">{shareText} of invoices</span>
      {sub && <span className="ring-sub">{sub}</span>}
    </div>
  );
}
