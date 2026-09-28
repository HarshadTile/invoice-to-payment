/* Runtime dataset — the live in-memory copy of the records the app reads.
 *
 * Before the DB existed these came from the static arrays in ./invoices.js.
 * Now they are filled once, after login, by the bootstrap call (see
 * src/features/bootstrap/hydrateThunks.js). Tests fill them via
 * src/test/hydrateStore.js.
 *
 * The arrays are mutated in place and never reassigned, so modules that keep a
 * reference to `runtime.invoices` always see the current data. */
export const runtime = {
  invoices: [],
  syncLog: [],
};

export function setRuntimeData({ invoices, syncLog } = {}) {
  if (invoices) runtime.invoices.splice(0, runtime.invoices.length, ...invoices);
  if (syncLog) runtime.syncLog.splice(0, runtime.syncLog.length, ...syncLog);
}

export function suppliersFromRuntime() {
  return [...new Set(runtime.invoices.map((i) => i.vendor))];
}
