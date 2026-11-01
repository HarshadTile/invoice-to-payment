/** Indian financial year (April-March) of a date, e.g. "2026-27". */
export function getFiscalYear(dateStr) {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth();
  if (month < 3) return `${year - 1}-${String(year).slice(2)}`;
  return `${year}-${String(year + 1).slice(2)}`;
}
