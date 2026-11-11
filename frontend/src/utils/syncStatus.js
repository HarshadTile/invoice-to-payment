/* Wording for the invoice sync status ("Data as of ..."), kept free of React so it is easy to test. */

const DATE_TIME = { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' };

/** '6 Nov, 6:22 pm' in the viewer's time zone; '' for a missing / invalid timestamp. */
export function formatSyncTime(iso, locale = 'en-IN') {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(locale, DATE_TIME);
}

/** '5 min ago', '3 h ago', '2 days ago'. */
export function formatAge(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return '';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  const hours = minutes / 60;
  if (hours < 48) return `${Math.round(hours)} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/**
 * The top-bar label for the invoice data. `tone` is 'ok' or 'warn'; `title` explains a warning.
 * Returns null when there is nothing worth showing yet.
 */
export function freshnessLabel(status, now = new Date()) {
  if (!status || !status.dataAsOf) return null;
  const when = formatSyncTime(status.dataAsOf);
  if (!when) return null;
  const ageMinutes = (now.getTime() - new Date(status.dataAsOf).getTime()) / 60000;
  const failing = status.lastSyncOk === false;
  const warn = Boolean(status.stale || failing);
  let title = `Invoice data was last updated from the source ${formatAge(ageMinutes)}.`;
  if (status.live === false) title = 'Invoice data comes from local files (live sync is off).';
  if (failing) title = 'The latest automatic update failed, so you are seeing the last successful data. The team has been notified in the sync log.';
  else if (status.stale) title = `Invoice data has not been updated for ${formatAge(ageMinutes).replace(' ago', '')}.`;
  return { text: `Data as of ${when}`, tone: warn ? 'warn' : 'ok', title };
}
