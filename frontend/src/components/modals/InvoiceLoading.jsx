import ModalShell from './ModalShell.jsx';

/** An invoice modal while its invoice loads from the server, or why it could not be shown. */
export default function InvoiceLoading({ lookup, title, width }) {
  return (
    <ModalShell title={title} width={width}>
      {lookup.isLoading && <p role="status" className="cell-muted">Loading invoice…</p>}
      {lookup.isError && (
        <p role="alert">
          The invoice could not be loaded: {lookup.error?.message || 'try again'}.{' '}
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => lookup.refetch()}>Retry</button>
        </p>
      )}
      {!lookup.isLoading && !lookup.isError && <p role="status" className="cell-muted">This invoice is no longer available.</p>}
    </ModalShell>
  );
}
