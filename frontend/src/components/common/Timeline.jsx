import Badge from './Badge.jsx';

const TONE_BY_STATUS = { Completed: 'green', 'In Progress': 'blue', Failed: 'red', Open: 'red', Resolved: 'green', Closed: 'gray' };
const DOT_BG = { Failed: 'var(--red)', Completed: 'var(--green)' };

export default function Timeline({ events }) {
  if (!events.length) return <p style={{ color: 'var(--text-muted)', fontSize: 12.5, margin: '6px 0' }}>No history yet.</p>;
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
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ev.date}</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{ev.event}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>{ev.stage}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Handled by <b>{ev.person}</b>{ev.role ? ` · ${ev.role}` : ''}{' '}
              <Badge tone={TONE_BY_STATUS[ev.status] || 'gray'}>{ev.status}</Badge>
            </div>
            {ev.remarks && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3, fontStyle: 'italic' }}>{ev.remarks}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
