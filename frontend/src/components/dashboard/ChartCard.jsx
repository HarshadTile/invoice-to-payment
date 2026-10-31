import { useState } from 'react';

/**
 * A dashboard card with a Chart / Table switch: every chart has an exact table twin, so no value
 * is reachable only by hovering. `table` is { head: [...], rows: [[...], ...], foot?: [...] }.
 */
export default function ChartCard({ title, hint, table, note, actions, className = '', children }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={`card chart-card ${className}`.trim()}>
      <div className="chart-card-head">
        <h3>{title}{hint && <span className="card-hint">{hint}</span>}</h3>
        {(actions || table) && (
          <div className="chart-card-actions">
            {actions}
            {table && (
              <div className="chart-view-switch" role="group" aria-label={`${title} view`}>
                <button type="button" aria-pressed={!asTable} className={!asTable ? 'active' : ''} onClick={() => setAsTable(false)}>Chart</button>
                <button type="button" aria-pressed={asTable} className={asTable ? 'active' : ''} onClick={() => setAsTable(true)}>Table</button>
              </div>
            )}
          </div>
        )}
      </div>
      {asTable && table ? (
        <div className="chart-table-wrap">
          <table className="chart-table">
            <thead><tr>{table.head.map((cell, i) => <th key={i} className={i ? 'num' : undefined}>{cell}</th>)}</tr></thead>
            <tbody>{table.rows.map((row, r) => <tr key={r}>{row.map((cell, i) => <td key={i} className={i ? 'num' : undefined}>{cell}</td>)}</tr>)}</tbody>
            {table.foot && <tfoot><tr>{table.foot.map((cell, i) => <td key={i} className={i ? 'num' : undefined}>{cell}</td>)}</tr></tfoot>}
          </table>
        </div>
      ) : children}
      {note && <p className="chart-note">{note}</p>}
    </section>
  );
}
