import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { vendorCodesFor } from '../utils/businessLogic';
import { runtime } from '../data/runtime';
import { CHANNEL_LABEL } from '../data/constants';
import { pushToast } from '../features/ui/uiSlice';
import { authApi } from '../api/authApi';

export default function ProfilePage() {
  const { authType, currentUser, supplierQuery, supplierPAN, supplierLoginVcode, channelScope, role } = useSelector((s) => s.auth);
  const dispatch = useDispatch();
  const [sendingReset, setSendingReset] = useState(false);

  async function requestPasswordReset() {
    setSendingReset(true);
    try {
      await authApi.forgotPassword(currentUser.email);
      dispatch(pushToast(`If ${currentUser.email} has an account, a reset link has been sent to it.`));
    } catch (err) {
      dispatch(pushToast(err.message || 'Something went wrong. Please try again.'));
    } finally {
      setSendingReset(false);
    }
  }

  if (authType === 'supplier') {
    const pan = runtime.invoices.find((invoice) => invoice.vcode === supplierLoginVcode)?.pan || supplierPAN || '-';
    const codes = vendorCodesFor(supplierQuery);
    return (
      <>
        <div className="card" style={{ maxWidth: 960, margin: '0 auto', padding: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 24, paddingBottom: 22, borderBottom: '1px solid var(--border-soft)' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                Supplier Account
              </div>
              <h2 style={{ fontSize: 22, lineHeight: 1.4, margin: 0, overflowWrap: 'anywhere' }}>{supplierQuery}</h2>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12, marginBottom: 20 }}>
            <ProfileInfo label="Signed-in Vendor Code" value={supplierLoginVcode} mono />
            <ProfileInfo label="PAN" value={pan} mono />
          </div>

          <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Vendor codes</h3>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{codes.length} {codes.length === 1 ? 'code' : 'codes'}</span>
            </div>
            <p style={{ margin: '0 0 14px', fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-muted)' }}>Codes associated with your supplier account. Invoice access is limited to your signed-in vendor code.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {codes.map((c) => (
                <span
                  key={c}
                  className={`chip mono ${c === supplierLoginVcode ? '' : 'gray'}`}
                  style={c === supplierLoginVcode ? { background: 'var(--brand-tint)', color: 'var(--brand)' } : undefined}
                >
                  {c}{c === supplierLoginVcode ? ' · Current login' : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  const accessScope = channelScope === 'all' ? 'All channels (HQ / Admin)' : `${CHANNEL_LABEL[channelScope] || channelScope} only`;

  return (
    <>
      <div className="profile-grid">
        <div className="card profile-hero">
          <div className="avatar" aria-hidden="true">{currentUser.initials}</div>
          <h2 className="profile-name">{currentUser.name}</h2>
          {(currentUser.title || role) && <p className="profile-title">{currentUser.title || role}</p>}
          {currentUser.dept && <p className="profile-dept">{currentUser.dept}</p>}
          <div style={{ marginTop: 18 }}><span className="chip gray">Internal account</span></div>
        </div>

        <div className="card">
          <section className="profile-section">
            <h3>Account details</h3>
            <p>Contact your administrator to update your details or portal access.</p>
            <div className="pf-grid">
              <ProfileField label="Full name" value={currentUser.fullName || currentUser.name} />
              <ProfileField label="Email" value={currentUser.email} />
              <ProfileField label="Job title" value={currentUser.title} />
              <ProfileField label="Department" value={currentUser.dept} />
              <ProfileField label="Role" value={role} />
              <ProfileField label="Portal access" value={accessScope} />
            </div>
          </section>

          <section className="profile-section">
            <h3>Security</h3>
            <p>Keep your account protected.</p>
            <div className="pf-row">
              <div>
                <div className="pf-row-title">Password</div>
                <div className="pf-row-desc">Send a password reset link to your registered email address.</div>
              </div>
              <button type="button" className="btn" onClick={requestPasswordReset} disabled={sendingReset || !currentUser.email}>
                {sendingReset ? 'Sending…' : 'Send reset link'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function ProfileField({ label, value, wide = false }) {
  return (
    <div className={`pf-field${wide ? ' wide' : ''}`}>
      <div className="pf-label">{label}</div>
      <div className="pf-value">{value || <span style={{ color: 'var(--text-muted)' }}>Not set</span>}</div>
    </div>
  );
}

function ProfileInfo({ label, value, mono = false }) {
  return (
    <div style={{ background: '#FAFBFC', border: '1px solid var(--border-soft)', borderRadius: 9, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>{label}</div>
      <div className={mono ? 'mono' : undefined} style={{ fontSize: 14, color: 'var(--text)', overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  );
}
