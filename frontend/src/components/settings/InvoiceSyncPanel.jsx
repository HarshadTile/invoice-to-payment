import { useState } from 'react';
import { useDispatch } from 'react-redux';
import Badge from '../common/Badge.jsx';
import { AlertTriangle, CheckCircle, Database, RefreshCw } from '../common/icons.jsx';
import { useGetSyncStatusQuery, useRunSyncNowMutation } from '../../api/invoiceSyncApi';
import { useNotificationIdentity } from '../../features/notifications/useNotificationActions';
import { pushToast } from '../../features/ui/uiSlice';
import { formatSyncTime, overallProgress, sourceProgress } from '../../utils/syncStatus';

const LOADED_FROM = { bigquery: 'BigQuery', snapshot: 'Saved snapshot', file: 'Local file', none: 'Not loaded yet' };

/** Settings > Integrations: the automatic invoice sync from BigQuery, per source, with Sync now. */
export default function InvoiceSyncPanel({ canRun = false }) {
  const dispatch = useDispatch();
  const identity = useNotificationIdentity();
  // Every 2 s while a sync runs (for the progress bar), otherwise every 30 s.
  const [fast, setFast] = useState(false);
  const { data, isLoading, isError, refetch } = useGetSyncStatusQuery(identity, {
    skip: !identity, pollingInterval: fast ? 2000 : 30000, skipPollingIfUnfocused: true,
  });
  if (!!data?.running !== fast) setFast(!!data?.running);
  const overall = overallProgress(data);
  const [runSync, { isLoading: starting }] = useRunSyncNowMutation();

  async function syncNow() {
    try {
      const result = await runSync().unwrap();
      dispatch(pushToast(result?.msg || 'Sync started.'));
    } catch (err) {
      dispatch(pushToast(err?.data?.message || "Couldn't start the sync."));
    } finally {
      refetch();
    }
  }

  return (
    <div className="card set-card">
      <div className="set-card-head">
        <span className="set-card-ic" aria-hidden="true"><Database size={16} /></span>
        <div>
          <h3>Invoice data sync</h3>
          <p>{data ? `${data.schedule}${data.nextSyncAt ? ` · next run ${formatSyncTime(data.nextSyncAt)}` : ''}` : 'Automatic updates of invoice data from BigQuery.'}</p>
        </div>
        {canRun && data?.live && (
          <button type="button" className="btn btn-sm sync-now" onClick={syncNow} disabled={starting || data.running}>
            <RefreshCw size={14} aria-hidden="true" className={data.running ? 'spin' : undefined} />
            {data.running ? `Syncing… ${overall ?? 0}%` : 'Sync now'}
          </button>
        )}
      </div>
      {isLoading && <p className="chart-empty">Loading sync status…</p>}
      {isError && <p className="chart-empty">Sync status is unavailable right now.</p>}
      {data && (
        <ul className="set-integrations">
          {data.sources.map((s) => {
            const ok = s.lastSyncOk;
            const progress = data.running ? sourceProgress(s.progress) : null;
            return (
              <li key={s.source} className={ok ? 'ok' : 'bad'}>
                <span className="set-int-ic" aria-hidden="true">{ok ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}</span>
                <span className="set-int-name">
                  <b>{s.label}</b>
                  <small>
                    Data as of {formatSyncTime(s.dataAsOf) || '—'} · {LOADED_FROM[s.loadedFrom] || s.loadedFrom}
                    {s.rows != null ? ` · ${s.rows.toLocaleString('en-IN')} invoices` : ''}
                  </small>
                  {progress && (
                    <span className="sync-progress">
                      <span className="sync-progress-bar" role="progressbar" aria-label={`${s.label} sync progress`}
                        aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
                        <span style={{ width: `${progress.percent}%` }} />
                      </span>
                      <small>{progress.text} · {progress.percent}%</small>
                    </span>
                  )}
                  {!ok && (
                    <small className="sync-error">
                      Last attempt {formatSyncTime(s.lastAttemptAt)} failed{s.consecutiveFailures > 1 ? ` (${s.consecutiveFailures} in a row)` : ''}
                      {s.lastError ? `: ${s.lastError}` : ''}. Retrying automatically.
                    </small>
                  )}
                </span>
                <Badge tone={ok ? 'green' : 'red'}><span className="set-dot" aria-hidden="true" />{ok ? 'Healthy' : 'Failing'}</Badge>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
