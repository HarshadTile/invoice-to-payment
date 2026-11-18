import { useMemo, useState } from 'react';

const DAY = /(\d{1,2}) ([A-Za-z]{3})[A-Za-z]* (\d{4})/; // also reads "Sept"

/** Milliseconds for a Date, ISO string or a display date like "04 Sep 2026" (for
 *  "12 Sep 2026 / 04 Sep 2026" the first date is used). Unreadable values give null. */
export function dateValue(value) {
  if (value == null || value === '' || value === '-') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  const text = String(value);
  const match = DAY.exec(text);
  const ms = match ? Date.parse(`${match[1]} ${match[2]} ${match[3]}`) : Date.parse(text);
  return Number.isNaN(ms) ? null : ms;
}

/** Click-to-sort state for a date column. `dir` is 'asc' | 'desc' | null (null keeps the
 *  source order). Rows without a readable date always go last. */
export function useDateSort(rows, getDate, initialDir = null) {
  const [dir, setDir] = useState(initialDir);
  const sorted = useMemo(() => {
    if (!dir) return rows;
    const factor = dir === 'asc' ? 1 : -1;
    return rows
      .map((row, index) => ({ row, index, ms: dateValue(getDate(row)) }))
      .sort((a, b) => {
        if (a.ms === null || b.ms === null) return (a.ms === null) - (b.ms === null) || a.index - b.index;
        return (a.ms - b.ms) * factor || a.index - b.index;
      })
      .map((item) => item.row);
  // getDate is a stable accessor at every call site
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, dir]);
  // First click shows newest first, then it flips between the two.
  const toggle = () => setDir((d) => (d === 'desc' ? 'asc' : 'desc'));
  return { sorted, dir, toggle };
}

/** Click-to-sort for a table with several date columns. `getters` maps a column key to the
 *  function that reads that column's date, e.g. { invoice: (r) => r.rawDate, status: (r) => r.date }.
 *  One column is active at a time; its first click shows newest first, then it flips. Rows without a
 *  readable date always go last. With no column chosen, `fallback` (the date the page filters on)
 *  orders the rows oldest first, as the server does; without it the source order is kept. A new
 *  `resetKey` (e.g. a different date type) drops the clicked column. */
export function useDateColumnSort(rows, getters, { fallback, resetKey } = {}) {
  const [sort, setSort] = useState({ key: null, dir: null, resetKey });
  const active = sort.resetKey === resetKey ? sort : { key: null, dir: null, resetKey };
  const sorted = useMemo(() => {
    const read = (active.key && getters[active.key]) || (!active.key && fallback);
    if (!read) return rows;
    const factor = active.key && active.dir !== 'asc' ? -1 : 1;
    return rows
      .map((row, index) => ({ row, index, ms: dateValue(read(row)) }))
      .sort((a, b) => {
        if (a.ms === null || b.ms === null) return (a.ms === null) - (b.ms === null) || a.index - b.index;
        return (a.ms - b.ms) * factor || a.index - b.index;
      })
      .map((item) => item.row);
  // getters are stable accessors at every call site; `fallback` changes only with `resetKey`
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, active.key, active.dir, resetKey, !!fallback]);
  const toggle = (key) => setSort((cur) => {
    const current = cur.resetKey === resetKey ? cur : { key: null, dir: null };
    return { key, dir: current.key === key && current.dir === 'desc' ? 'asc' : 'desc', resetKey };
  });
  const dirFor = (key) => (active.key === key ? active.dir : null);
  return { sorted, toggle, dirFor };
}
