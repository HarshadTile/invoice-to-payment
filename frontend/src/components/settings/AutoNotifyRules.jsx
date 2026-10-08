import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectTable, setRows, setRowsLocal } from '../../features/tables/tablesSlice';
import { saveSenderEmail } from '../../features/settings/settingsSlice';
import { selectPerm } from '../../features/auth/authSlice';
import { pushToast } from '../../features/ui/uiSlice';
import ModalShell from '../modals/ModalShell.jsx';
import { Bell, Edit, Mail, Plus, Trash } from '../common/icons.jsx';

const TABLE_KEY = 'settings-notifications';
// The events a rule can react to. A rule row is [event, to, cc, 'On' | 'Off'].
const EVENTS = ['Invoice Uploaded', 'Approval Pending > 3 days', 'Payment Due Today', 'Payment Completed'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const recipients = (text) => String(text || '').split(',').map((r) => r.trim()).filter((r) => r && r !== '-');

function Chips({ label, text }) {
  const list = recipients(text);
  return (
    <span className="rule-line">
      <span className="rule-line-k">{label}</span>
      {list.length ? list.map((r) => <span className="rule-chip" key={r}>{r}</span>) : <span className="rule-none">None</span>}
    </span>
  );
}

function SenderCard({ canEdit }) {
  const dispatch = useDispatch();
  const saved = useSelector((s) => s.settings.senderEmail);
  const [value, setValue] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const trimmed = value.trim();
  const dirty = trimmed !== saved;

  async function save() {
    if (!EMAIL_RE.test(trimmed)) { setError('Enter a valid email address.'); return; }
    setBusy(true); setError('');
    try {
      await dispatch(saveSenderEmail(trimmed));
      dispatch(pushToast('Sender email updated.'));
    } catch (err) {
      setError(err.message || 'Could not save the sender email.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card rule-sender">
      <div className="rule-sender-text">
        <h3>Sender email</h3>
        <p>Automatic emails are sent from this address.</p>
      </div>
      <div className="rule-sender-form">
        <div className="rule-sender-row">
          <input
            type="email" value={value} readOnly={!canEdit} aria-label="Sender email for auto-mails"
            onChange={(e) => { setValue(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && dirty) save(); }}
          />
          {canEdit && <button type="button" className="btn primary" onClick={save} disabled={!dirty || busy}>{busy ? 'Saving…' : 'Save'}</button>}
        </div>
        {error && <span className="rule-error">{error}</span>}
      </div>
    </div>
  );
}

function RuleModal({ rule, rules, onClose, onSave }) {
  const editing = !!rule;
  const [event, setEvent] = useState(rule?.[0] || '');
  const [to, setTo] = useState(rule?.[1] === '-' ? '' : rule?.[1] || '');
  const [cc, setCc] = useState(rule?.[2] === '-' ? '' : rule?.[2] || '');
  const [active, setActive] = useState(rule ? rule[3] === 'On' : true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!event) { setError('Choose the event this rule reacts to.'); return; }
    if (!recipients(to).length) { setError('Add at least one recipient to notify.'); return; }
    if (rules.some((r) => r[0] === event && r !== rule)) { setError('There is already a rule for this event. Edit that one instead.'); return; }
    setBusy(true);
    try {
      await onSave([event, recipients(to).join(', '), recipients(cc).join(', ') || '-', active ? 'On' : 'Off']);
    } catch (err) {
      setError(err.message || 'Could not save the rule.');
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title={editing ? 'Edit rule' : 'Add rule'} width={500} onClose={busy ? () => {} : onClose}
      foot={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add rule'}</button>
        </>
      )}
    >
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="form-field">
        <label htmlFor="rule-event">When this happens</label>
        <select id="rule-event" value={event} onChange={(e) => { setEvent(e.target.value); setError(''); }}>
          <option value="">Select an event…</option>
          {[...new Set([...EVENTS, ...(rule ? [rule[0]] : [])])].map((ev) => <option key={ev} value={ev}>{ev}</option>)}
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="rule-to">Send to</label>
        <input id="rule-to" value={to} onChange={(e) => { setTo(e.target.value); setError(''); }} placeholder="e.g. Supplier, MDE Invoice Team" />
        <span className="rule-hint">Separate several recipients with commas.</span>
      </div>
      <div className="form-field">
        <label htmlFor="rule-cc">CC (optional)</label>
        <input id="rule-cc" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="e.g. COE" />
      </div>
      <div className="rule-modal-toggle">
        <span>Rule is active</span>
        <button type="button" className={`toggle${active ? ' on' : ''}`} aria-pressed={active} aria-label="Rule is active" onClick={() => setActive((v) => !v)}><div className="dot" /></button>
      </div>
    </ModalShell>
  );
}

export default function AutoNotifyRules() {
  const dispatch = useDispatch();
  const rules = useSelector((s) => selectTable(s, TABLE_KEY));
  const canEdit = useSelector(selectPerm).manageConfig;
  const [form, setForm] = useState(undefined); // undefined = closed, null = new, number = index being edited
  const [removeIdx, setRemoveIdx] = useState(null);
  const [removing, setRemoving] = useState(false);

  const activeCount = rules.filter((r) => r[3] === 'On').length;

  // Optimistic like the rest of Settings; if the server refuses, put the old rules back.
  async function persist(next) {
    const previous = rules;
    try {
      await dispatch(setRows({ key: TABLE_KEY, rows: next }));
    } catch (err) {
      dispatch(setRowsLocal({ key: TABLE_KEY, rows: previous }));
      throw err;
    }
  }

  async function toggle(idx) {
    try {
      await persist(rules.map((r, i) => (i === idx ? [r[0], r[1], r[2], r[3] === 'On' ? 'Off' : 'On'] : r)));
    } catch (err) {
      dispatch(pushToast(err.message || 'Could not save that change.'));
    }
  }

  async function saveRule(row) {
    await persist(form === null ? [...rules, row] : rules.map((r, i) => (i === form ? row : r)));
    dispatch(pushToast(form === null ? 'Rule added.' : 'Rule updated.'));
    setForm(undefined);
  }

  async function removeRule() {
    setRemoving(true);
    try {
      await persist(rules.filter((_, i) => i !== removeIdx));
      setRemoveIdx(null);
      dispatch(pushToast('Rule removed.'));
    } catch (err) {
      dispatch(pushToast(err.message || 'Could not remove the rule.'));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <section className="rule-page">
      <SenderCard canEdit={canEdit} />

      <div className="card rule-card">
        <div className="rule-head">
          <div>
            <h3>Auto-notify rules</h3>
            <p>{rules.length ? `${rules.length} rule${rules.length === 1 ? '' : 's'} · ${activeCount} active` : 'Choose who is emailed when something happens to an invoice.'}</p>
          </div>
          {canEdit && <button type="button" className="btn primary" onClick={() => setForm(null)}><Plus />Add rule</button>}
        </div>

        {!rules.length && (
          <div className="empty-state">
            <Bell />
            <b>No auto-notify rules yet</b>
            <span>{canEdit ? 'Add a rule to decide who is emailed for each event.' : 'An administrator has not set up any rules yet.'}</span>
          </div>
        )}

        {rules.map((r, idx) => (
          <div className={`rule-row${r[3] === 'On' ? '' : ' off'}`} key={r[0]}>
            <span className="rule-icon"><Mail size={16} /></span>
            <div className="rule-main">
              <div className="rule-title">{r[0]}</div>
              <div className="rule-lines">
                <Chips label="To" text={r[1]} />
                <Chips label="CC" text={r[2]} />
              </div>
            </div>
            <span className={`rule-state${r[3] === 'On' ? ' on' : ''}`}>{r[3] === 'On' ? 'Active' : 'Paused'}</span>
            <button
              type="button" className={`toggle${r[3] === 'On' ? ' on' : ''}`} disabled={!canEdit}
              aria-label={`${r[0]} rule is ${r[3] === 'On' ? 'active' : 'paused'}`} aria-pressed={r[3] === 'On'}
              onClick={() => toggle(idx)}
            ><div className="dot" /></button>
            {canEdit && (
              <span className="row-actions">
                <button type="button" className="kebab" title="Edit rule" aria-label={`Edit ${r[0]} rule`} onClick={() => setForm(idx)}><Edit /></button>
                <button type="button" className="kebab" title="Remove rule" aria-label={`Remove ${r[0]} rule`} onClick={() => setRemoveIdx(idx)}><Trash /></button>
              </span>
            )}
          </div>
        ))}
      </div>

      <p className="rule-footnote">Rules are saved for the whole team and every change is recorded in Audit Logs.</p>

      {form !== undefined && (
        <RuleModal rule={form === null ? null : rules[form]} rules={rules} onClose={() => setForm(undefined)} onSave={saveRule} />
      )}
      {removeIdx !== null && (
        <ModalShell
          title="Remove rule" width={440} onClose={removing ? () => {} : () => setRemoveIdx(null)}
          foot={(
            <>
              <button type="button" className="btn" onClick={() => setRemoveIdx(null)} disabled={removing}>Cancel</button>
              <button type="button" className="btn danger" onClick={removeRule} disabled={removing}>{removing ? 'Removing…' : 'Remove rule'}</button>
            </>
          )}
        >
          <p className="modal-copy">Remove the <b>{rules[removeIdx]?.[0]}</b> rule? Nobody will be emailed for this event any more.</p>
        </ModalShell>
      )}
    </section>
  );
}
