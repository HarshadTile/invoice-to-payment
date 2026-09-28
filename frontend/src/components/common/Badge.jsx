export default function Badge({ tone = 'gray', children }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}
