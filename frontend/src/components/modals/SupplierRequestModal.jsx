import { useEffect, useMemo, useState } from 'react';
import { suppliersApi } from '../../api/suppliersApi';
import { CHANNEL_LABEL } from '../../data/constants';
import { formatDayTime } from '../../utils/supplierLog';
import Badge from '../common/Badge.jsx';
import ModalShell from './ModalShell.jsx';
import VendorCodeOption, { useCodeOwner } from '../supplier/VendorCodeOption.jsx';
import { AlertTriangle, CheckCircle, X } from '../common/icons.jsx';

const REASONS = [
  { value: 'mismatch', label: "Details don't match our records" },
  { value: 'incomplete', label: 'Incomplete information' },
  { value: 'not_in_system', label: 'Vendor not in our system yet' },
  { value: 'other', label: 'Other (write a note)' },
];
const STATUS_TONE = { Pending: 'amber', Approved: 'green', Rejected: 'red' };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const lower = (c) => String(c).toLowerCase();
/** The server sends UTC times without a zone. */
export const requestTime = (iso) => (iso ? formatDayTime(new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`)) : '');
/** The note for the supplier's email when some requested codes couldn't be matched. */
export function unmatchedCodesNote(checks, pan) {
  const missing = checks.filter((c) => !c.found).map((c) => c.code);
  const otherPan = checks.filter((c) => c.found && !c.panMatches).map((c) => c.code);
  const lines = [];
  if (missing.length) lines.push(`We couldn't find ${missing.length === 1 ? 'this vendor code' : 'these vendor codes'} in our system: ${missing.join(', ')}.`);
  if (otherPan.length) lines.push(`${otherPan.length === 1 ? 'This vendor code belongs' : 'These vendor codes belong'} to a different PAN than ${pan || 'yours'}: ${otherPan.join(', ')}.`);
  if (!lines.length) return '';
  lines.push('Please check the code and, if it is correct, ask for it from your profile (Vendor code access) after you sign in.');
  return lines.join(' ');
}

/** Codes in first-seen order without case duplicates. */
function uniqueCodes(list) {
  const seen = new Set();
  return list.filter((c) => c && !seen.has(lower(c)) && seen.add(lower(c)));
}

/**
 * Review one supplier access request: what was sent, how it matches the invoice data, and a
 * form already filled from it. Approving creates the account (and emails the setup link) or
 * applies the vendor code change; rejecting emails the chosen reason to the supplier.
 */
export default function SupplierRequestModal({ requestId, onClose, onDecided }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [email, setEmail] = useState('');
  const [pan, setPan] = useState('');
  const [codes, setCodes] = useState([]);
  const [extraCode, setExtraCode] = useState('');
  const [extraOptions, setExtraOptions] = useState([]);
  const [rejecting, setRejecting] = useState(false);
  const [supplierNote, setSupplierNote] = useState('');
  const [reason, setReason] = useState('mismatch');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let stale = false;
    suppliersApi.getRequest(requestId).then((d) => {
      if (stale) return;
      setData(d);
      const req = d.request;
      setEmail(req.email || '');
      setPan(req.pan || d.suggestedPan || '');
      // Tick what the supplier asked for, in the data's spelling where the data knows the code.
      const spelling = new Map([...d.panCodes, ...d.codeChecks.filter((c) => c.found).map((c) => c.code),
        ...((d.supplier && d.supplier.vendorCodes) || [])].map((c) => [lower(c), c]));
      const asked = req.kind === 'CHANGE_ACCESS' ? req.vendorCodes : d.codeChecks.filter((c) => c.found).map((c) => c.code);
      setCodes(uniqueCodes(asked.map((c) => spelling.get(lower(c)) || c)));
      // Codes that couldn't be matched are not given; the supplier is told so in the email.
      setSupplierNote(unmatchedCodesNote(d.codeChecks, req.pan));
    }).catch((err) => { if (!stale) setLoadError(err.message); });
    return () => { stale = true; };
  }, [requestId]);

  const ownerOf = useCodeOwner(data?.codeChannels);
  const onAccount = new Set(((data?.supplier && data.supplier.vendorCodes) || []).map((c) => String(c).toLowerCase()));
  // Another team's code can't be given here (the server would refuse it); one already on the
  // account stays as it is. So such codes show unticked or as they are, and aren't sent.
  const canSend = (code) => !ownerOf(code) || onAccount.has(String(code).toLowerCase());
  const req = data?.request;
  const change = req?.kind === 'CHANGE_ACCESS';
  const pending = req?.status === 'Pending';
  const options = useMemo(() => {
    if (!data) return [];
    return uniqueCodes([
      ...((data.supplier && data.supplier.vendorCodes) || []),
      ...data.panCodes,
      ...data.codeChecks.filter((c) => c.found).map((c) => c.code),
      ...codes,
      ...extraOptions,
    ]);
  }, [data, codes, extraOptions]);
  const ticked = new Set(codes.map(lower));
  const toggle = (code) => setCodes((prev) => (ticked.has(lower(code)) ? prev.filter((c) => lower(c) !== lower(code)) : [...prev, code]));
  const addExtra = () => {
    const code = extraCode.trim();
    if (!code) return;
    setExtraOptions((prev) => uniqueCodes([...prev, code]));
    if (!ticked.has(lower(code))) setCodes((prev) => [...prev, code]);
    setExtraCode('');
  };

  async function approve() {
    const sendable = codes.filter(canSend);
    if (!sendable.length) { setError('Tick at least one vendor code.'); return; }
    if (!change && !EMAIL_PATTERN.test(email.trim())) { setError('Enter a valid email for the account.'); return; }
    setBusy(true);
    setError('');
    try {
      const note = supplierNote.trim() || undefined;
      const result = await suppliersApi.approveRequest(requestId, change
        ? { vendorCodes: sendable, note }
        : { vendorCodes: sendable, email: email.trim(), pan: pan.trim() || '', note });
      onDecided(result, 'approved');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  async function reject() {
    if (reason === 'other' && !message.trim()) { setError('Write a note for the supplier.'); return; }
    setBusy(true);
    setError('');
    try {
      const result = await suppliersApi.rejectRequest(requestId, { reason, message: message.trim() || null });
      onDecided(result, 'rejected');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  const foot = !pending ? (
    <button type="button" className="btn" onClick={onClose}>Close</button>
  ) : rejecting ? (
    <>
      <button type="button" className="btn" onClick={() => { setRejecting(false); setError(''); }} disabled={busy}>Back</button>
      <button type="button" className="btn danger" onClick={reject} disabled={busy}>{busy ? 'Sending…' : 'Reject and email supplier'}</button>
    </>
  ) : (
    <>
      <button type="button" className="btn" onClick={() => { setRejecting(true); setError(''); }} disabled={busy || !data}>Reject…</button>
      <button type="button" className="btn primary" onClick={approve} disabled={busy || !data || !codes.length}>
        {busy ? 'Saving…' : change ? 'Apply change' : 'Approve & send setup email'}
      </button>
    </>
  );

  return (
    <ModalShell title={change ? 'Vendor code change request' : 'Supplier account request'} width={720}
      className="supplier-request-modal" onClose={busy ? () => {} : onClose} foot={foot}>
      {loadError && <div className="form-error" role="alert">{loadError}</div>}
      {!data && !loadError && <p className="modal-copy">Loading request…</p>}
      {data && (
        <>
          {error && <div className="form-error" role="alert">{error}</div>}

          <section className="sr-head">
            <div className="supplier-avatar" aria-hidden="true">{(req.name || '?').trim().charAt(0).toUpperCase()}</div>
            <div className="sr-head-main">
              <div className="sr-head-tags">
                <Badge tone={change ? 'blue' : 'purple'}>{change ? 'Existing supplier' : 'New account'}</Badge>
                <Badge tone={STATUS_TONE[req.status] || 'gray'}>{req.status}</Badge>
              </div>
              <strong>{req.name}</strong>
              <span className="sr-head-meta">{req.email} · PAN {req.pan || 'not given'} · received {requestTime(req.createdAt)}</span>
            </div>
          </section>

          {req.note && (
            <blockquote className="sr-note"><span>Note from the supplier</span>{req.note}</blockquote>
          )}

          {change && data.supplier && (
            <section className="sr-block">
              <h4 className="inv-section-title">Requested change</h4>
              <div className="sr-change">
                <div><span>Has now</span>{data.supplier.vendorCodes.map((c) => <code key={c} className="sr-chip">{c}</code>)}</div>
                {req.addCodes.length > 0 && <div><span>Add</span>{req.addCodes.map((c) => <code key={c} className="sr-chip add">+ {c}</code>)}</div>}
                {req.removeCodes.length > 0 && <div><span>Remove</span>{req.removeCodes.map((c) => <code key={c} className="sr-chip remove">− {c}</code>)}</div>}
              </div>
            </section>
          )}

          {data.codeChecks.length > 0 && (
            <section className="sr-block">
              <h4 className="inv-section-title">Match with invoice data</h4>
              {req.pan && data.panInData === false && (
                <p className="sr-warn"><AlertTriangle size={14} />PAN {req.pan} was not found in the invoice data.</p>
              )}
              <table className="sr-checks">
                <thead><tr><th>Vendor code</th><th>In data</th><th>Supplier name in data</th><th>PAN in data</th></tr></thead>
                <tbody>
                  {data.codeChecks.map((c) => (
                    <tr key={c.code}>
                      <td><code>{c.code}</code></td>
                      <td>{c.found
                        ? <span className="sr-ok"><CheckCircle size={14} />Found</span>
                        : <span className="sr-bad"><X size={14} />Not found</span>}</td>
                      <td>{c.name || '—'}</td>
                      <td>{c.pan || '—'}{c.found && !c.panMatches && <span className="sr-bad"> · differs</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {data.existingAccounts.length > 0 && (
            <p className="sr-info">
              <AlertTriangle size={14} />
              <span>
                {change ? 'Other accounts' : 'Accounts already'} for this PAN or these codes:{' '}
                {data.existingAccounts.map((a) => `${a.email || a.name} (${a.vendorCodes.join(', ')})`).join('; ')}.
                {!change && ' A new account is fine for another location; it just needs its own email.'}
              </span>
            </p>
          )}

          {pending && !rejecting && (
            <section className="sr-block">
              <h4 className="inv-section-title">{change ? 'Codes the account will have' : 'Account to create'}</h4>
              {!change && (
                <div className="sr-form-grid">
                  <label className="sr-field">Sign-in email
                    <input className="search-box" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </label>
                  <label className="sr-field">PAN {data.suggestedPan && !req.pan && <small>from the data</small>}
                    <input className="search-box" value={pan} maxLength={10} placeholder="Blank if not available"
                      onChange={(e) => setPan(e.target.value.toUpperCase())} />
                  </label>
                </div>
              )}
              {data.channels?.length > 0 && (
                <p className="sr-foot-note sr-channels">
                  Invoices from: {data.channels.map((c) => CHANNEL_LABEL[c] || c).join(' and ')}.
                  {' '}The supplier sees invoices for their vendor codes from every channel.
                </p>
              )}
              <fieldset className="supplier-codes-fieldset sr-codes">
                <legend className="supplier-codes-heading">Vendor code access <span>{codes.filter(canSend).length} selected</span></legend>
                <p className="supplier-codes-help">
                  {data.panCodes.length ? 'Every code under this PAN is listed; the requested ones are ticked. ' : ''}
                  Tick more to give extra access.
                </p>
                {options.map((code) => (
                  <VendorCodeOption key={code} code={code} checked={ticked.has(lower(code)) && canSend(code)} onToggle={() => toggle(code)} owner={ownerOf(code)} />
                ))}
                <div className="sr-extra">
                  <input className="search-box" placeholder="Add another vendor code" aria-label="Add another vendor code" value={extraCode}
                    onChange={(e) => setExtraCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addExtra(); } }} />
                  <button type="button" className="btn" onClick={addExtra} disabled={!extraCode.trim()}>Add</button>
                </div>
              </fieldset>
              <label className="sr-field sr-supplier-note">
                <span>Message to the supplier <small>{supplierNote ? 'added to the email' : 'optional, added to the email'}</small></span>
                <textarea className="search-box sr-message" rows={3} maxLength={1000} value={supplierNote}
                  placeholder="e.g. Vendor code 12244 was not found in our system. Please check it and request it again."
                  onChange={(e) => setSupplierNote(e.target.value)} />
              </label>
              {data.codeChecks.some((c) => !c.found || !c.panMatches) && (
                <p className="sr-foot-note">Codes that couldn't be matched are not given; the message above tells the supplier which ones to check.</p>
              )}
              <p className="sr-foot-note">
                {change
                  ? 'The supplier is emailed the updated list of vendor codes.'
                  : 'The supplier gets an email to set a password, then signs in with this email.'}
              </p>
            </section>
          )}

          {pending && rejecting && (
            <section className="sr-block">
              <h4 className="inv-section-title">Reject and tell the supplier why</h4>
              <div className="sr-reasons" role="radiogroup" aria-label="Reason">
                {REASONS.map((r) => (
                  <label key={r.value} className={`sr-reason${reason === r.value ? ' is-selected' : ''}`}>
                    <input type="radio" name="sr-reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} />
                    {r.label}
                  </label>
                ))}
              </div>
              <label className="sr-field">Message to the supplier {reason !== 'other' && <small>optional</small>}
                <textarea className="search-box sr-message" rows={3} maxLength={1000} value={message}
                  placeholder="e.g. Vendor code DIE00131AA belongs to a different PAN. Please check and send a new request."
                  onChange={(e) => setMessage(e.target.value)} />
              </label>
              <p className="sr-foot-note">This is emailed to {req.email}. They can send a corrected request.</p>
            </section>
          )}

          {!pending && (
            <p className="sr-decided">
              {req.status} by {req.decidedBy || 'the team'}{req.decidedAt ? ` on ${requestTime(req.decidedAt)}` : ''}
              {req.decisionReason && ` · ${REASONS.find((r) => r.value === req.decisionReason)?.label || req.decisionReason}`}
              {req.decisionNote && ` · “${req.decisionNote}”`}
            </p>
          )}
        </>
      )}
    </ModalShell>
  );
}
