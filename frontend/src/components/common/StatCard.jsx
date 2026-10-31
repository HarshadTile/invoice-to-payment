/** A KPI tile. Optional `meter` (0–1) draws a share bar; `foot` is a second line under it. */
export default function StatCard({ label, value, sub, tone, icon, onClick, active, meter, foot }) {
  const cls = ['stat-card', tone, onClick ? 'clickable' : ''].filter(Boolean).join(' ');
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      className={cls}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      data-active={active ? 'true' : undefined}
      aria-pressed={onClick && active !== undefined ? !!active : undefined}
    >
      {icon && <div className="icon-badge" aria-hidden="true">{icon}</div>}
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
      {sub && <div className="sub">{sub}</div>}
      {meter != null && (
        <div className="stat-meter" aria-hidden="true"><span style={{ width: `${Math.min(Math.max(meter, 0), 1) * 100}%` }} /></div>
      )}
      {foot && <div className="stat-foot">{foot}</div>}
    </Comp>
  );
}
