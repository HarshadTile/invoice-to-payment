import Badge from './Badge.jsx';

const TONE_BY_STATUS = { Completed: 'green', 'In Progress': 'blue', Failed: 'red', Open: 'red', Resolved: 'green', Closed: 'gray' };
const DOT_BG = { Failed: 'var(--red)', Completed: 'var(--green)' };

export default function Timeline({ events }) {
  if (!events.length) return <p style={{ color: 'var(--text-muted)', fontSize: '0.78125rem', margin: '0.375rem 0' }}>No history yet.</p>;
  return (
    <div>
      {events.map((ev, i) => (
        <div className="timeline-item" key={i}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="timeline-dot" style={{ background: DOT_BG[ev.status] || 'var(--blue)' }}>
              {ev.status === 'Failed' ? '✕' : ev.status === 'Completed' ? '✓' : i + 1}
            </div>
            {i < events.length - 1 && <div className="timeline-line" />}
          </div>
          <div className="timeline-body">
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{ev.date}</div>
            <div style={{ fontSize: '0.78125rem', fontWeight: 600, color: 'var(--text)' }}>{ev.event}</div>
            <div style={{ fontSize: '0.71875rem', color: 'var(--text-muted)', marginTop: '0.0625rem' }}>{ev.stage}</div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>
              Handled by <b>{ev.person}</b>{ev.role ? ` · ${ev.role}` : ''}{' '}
              <Badge tone={TONE_BY_STATUS[ev.status] || 'gray'}>{ev.status}</Badge>
            </div>
            {ev.remarks && <div style={{ fontSize: '0.71875rem', color: 'var(--text-muted)', marginTop: '0.1875rem', fontStyle: 'italic' }}>{ev.remarks}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
