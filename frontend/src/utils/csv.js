/** CSV export: a timestamped file name, and the download itself. */
export function timestampedExportName(prefix, date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  const timestamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`;
  return `${prefix}_${timestamp}`;
}

export function downloadCSV(filename, cols, rows) {
  const csv = [cols.join(',')].concat(
    rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')),
  ).join('\n');
  // The leading BOM tells Excel the file is UTF-8, so symbols such as the rupee sign (₹) open correctly
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.replace(/\s+/g, '_') + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}
