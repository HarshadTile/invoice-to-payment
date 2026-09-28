export default function PagerFoot({ total, page, pageSize, onPage }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="foot-row">
      <span>Showing {from} to {to} of {total} entries</span>
      <div className="pager">
        <button type="button" className="pager-btn" disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))}>‹ Prev</button>
        <span className="pager-page">Page {page} of {totalPages}</span>
        <button type="button" className="pager-btn" disabled={page >= totalPages} onClick={() => onPage(Math.min(totalPages, page + 1))}>Next ›</button>
      </div>
    </div>
  );
}
