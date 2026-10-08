/** A table header cell that sorts its rows by date when clicked (see useDateSort). */
export default function SortDateTh({ label = 'Date', dir, onToggle, className, style }) {
  const next = dir === 'desc' ? 'oldest first' : 'newest first';
  return (
    <th scope="col" className={className} style={style} aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}>
      <button type="button" className="th-sort" onClick={onToggle} title={`Sort by ${label.toLowerCase()}: ${next}`}>
        {label}<span className="th-arrow">{dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : '⇅'}</span>
      </button>
    </th>
  );
}
