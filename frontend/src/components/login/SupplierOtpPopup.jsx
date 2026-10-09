import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';

export default function SupplierOtpPopup({ challenge, onChallenge, onVerify, onCancel, busy, error }) {
  const dialog = useRef(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [wait, setWait] = useState(challenge.resend_after);
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  useEffect(() => {
    setCode('');
    setWait(challenge.resend_after);
  }, [challenge]);
  useEffect(() => {
    const timer = setInterval(() => setWait((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  async function resend() {
    setSending(true);
    setMessage('');
    try {
      onChallenge(await api.post('/v1/auth/supplier/otp/resend', { challenge_id: challenge.challenge_id }));
      setMessage('A new code has been sent.');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSending(false);
    }
  }

  async function cancel() {
    if (busy || sending) return;
    setSending(true);
    try {
      await api.post('/v1/auth/supplier/otp/cancel', { challenge_id: challenge.challenge_id });
      onCancel();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <dialog ref={dialog} className="lgn-otp-popup" aria-labelledby="supplier-otp-title"
      onCancel={(event) => { event.preventDefault(); cancel(); }}>
      <h2 id="supplier-otp-title">Verify your mobile</h2>
      <p>Enter the code sent to ****{challenge.phone_last4}.</p>
      <p>The code expires in five minutes.</p>
      <form className="lgn-form" onSubmit={(event) => {
        event.preventDefault();
        if (/^[0-9]{6}$/.test(code)) { setMessage(''); onVerify(code); }
        else setMessage('Enter the six-digit code.');
      }}>
        <label htmlFor="supplier-otp-code">Verification code</label>
        <input id="supplier-otp-code" autoFocus inputMode="numeric" autoComplete="one-time-code"
          maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ''))}
          disabled={busy || sending} />
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <button type="submit" className="lgn-submit" disabled={busy || sending}>Verify</button>
        <button type="button" className="lgn-link" disabled={busy || sending || wait > 0} onClick={resend}>
          Resend{wait > 0 ? ` (${wait}s)` : ''}
        </button>
        <button type="button" className="lgn-link" disabled={busy || sending} onClick={cancel}>Cancel</button>
      </form>
    </dialog>
  );
}
