import { useState } from 'react';
import { formatCount } from '../../features/invoices/dashboardMetrics';

/** Round axis maximum and step: 1 / 2 / 5 × 10^n, about four gridlines. */
function niceScale(max) {
  if (max <= 0) return { top: 4, step: 1 };
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough);
  return { top: Math.ceil(max / step) * step, step };
}
const tick = (n) => (n >= 10000 ? `${Math.round(n / 1000)}K` : formatCount(n));

/**
 * Stacked columns over time. `columns` = [{ key, label, [seriesKey]: number }],
 * `series` = [{ key, label, color }] bottom-up. Hover / focus a column for every series' value;
 * only the latest column carries a printed total. `format` / `tickFormat` / `unit` let it plot
 * amounts; `detail(column)` adds a line to the tip. One series needs no legend (the title names it).
 */
export default function ColumnChart({ columns, series, label, format = formatCount, tickFormat = tick, unit = 'invoices', detail, onColumnClick, selectedKey }) {
  const [hi, setHi] = useState(null);
  const totals = columns.map((c) => series.reduce((sum, s) => sum + (c[s.key] || 0), 0));
  const { top, step } = niceScale(Math.max(...totals, 0));
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const active = hi != null ? columns[hi] : null;
  const visibleSeries = series.filter((s) => columns.some((c) => c[s.key] > 0));

  return (
    <div className="col-chart">
      {active ? (
        <div className="chart-tip" role="status">
          <b>{active.label}</b>
          <span>{format(totals[hi])}{unit ? ` ${unit}` : ''}</span>
          {detail && <span>{detail(active)}</span>}
          {series.length > 1 && visibleSeries.map((s) => (
            <span key={s.key} className="chart-tip-series"><i style={{ background: s.color }} />{s.label} {format(active[s.key] || 0)}</span>
          ))}
        </div>
      ) : (
        <div className="chart-legend">
          {series.length > 1 && visibleSeries.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
        </div>
      )}
      <div className="col-plot" role="group" aria-label={label}>
        <div className="col-grid" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} style={{ bottom: `${(t / top) * 100}%` }}><em>{tickFormat(t)}</em></span>
          ))}
        </div>
        <div className={`col-bars${onColumnClick ? ' clickable' : ''}`}>
          {columns.map((c, i) => {
            const total = totals[i];
            const isLast = i === columns.length - 1;
            return (
              <button
                type="button" key={c.key}
                className={`col-slot${hi === i ? ' hi' : ''}${selectedKey === c.key ? ' selected' : ''}`}
                aria-pressed={onColumnClick ? selectedKey === c.key : undefined}
                onClick={onColumnClick ? () => onColumnClick(c) : undefined}
                aria-label={`${c.label}: ${format(total)}${unit ? ` ${unit}` : ''}${series.length > 1 ? `, ${series.map((s) => `${s.label} ${format(c[s.key] || 0)}`).join(', ')}` : ''}${detail ? `, ${detail(c)}` : ''}`}
                onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}
                onFocus={() => setHi(i)} onBlur={() => setHi(null)}
              >
                <span className="col-stack" style={{ height: `${(total / top) * 100}%` }}>
                  {isLast && total > 0 && <span className="col-cap">{format(total)}</span>}
                  {series.map((s) => (c[s.key] > 0 ? (
                    <span key={s.key} className="col-seg" style={{ flexGrow: c[s.key], background: s.color }} />
                  ) : null))}
                </span>
                <span className="col-x">{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
