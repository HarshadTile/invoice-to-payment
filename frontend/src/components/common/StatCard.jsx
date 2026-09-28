export default function StatCard({ label, value, sub, tone, icon, onClick, active }) {
  const cls = ['stat-card', tone, onClick ? 'clickable' : ''].filter(Boolean).join(' ');
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      className={cls}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      data-active={active ? 'true' : undefined}
      aria-pressed={onClick ? !!active : undefined}
    >
      {icon && <div className="icon-badge" aria-hidden="true">{icon}</div>}
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </Comp>
  );
}
