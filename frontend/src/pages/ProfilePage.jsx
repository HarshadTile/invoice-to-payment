import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { vendorCodesFor } from '../utils/businessLogic';
import { runtime } from '../data/runtime';
import { CHANNEL_LABEL } from '../data/constants';
import { selectScopedInvoices } from '../features/invoices/selectors';
import { toggleTwoFactor } from '../features/settings/settingsSlice';
import { pushToast } from '../features/ui/uiSlice';
import { authApi } from '../api/authApi';
import { useGetTicketsQuery } from '../features/tickets/ticketsApi';

export default function ProfilePage() {
  const { authType, currentUser, supplierQuery, supplierPAN, supplierLoginVcode, channelScope, role } = useSelector((s) => s.auth);
  const dispatch = useDispatch();
  const twoFactorOn = useSelector((s) => s.settings.twoFactorOn);
  const scopedInvoices = useSelector(selectScopedInvoices);
  const { data: ticketPage } = useGetTicketsQuery({ page_size: 100 });
  const openQueries = (ticketPage?.items || []).filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length;
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
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                Supplier Account
              </div>
              <h2 style={{ fontSize: 22, lineHeight: 1.2, margin: 0 }}>{supplierQuery}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <span className="chip mono" style={{ background: 'var(--brand-tint)', color: 'var(--brand)' }}>{supplierLoginVcode}</span>
                <span className="chip gray mono">PAN {pan}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12, marginBottom: 20 }}>
            <ProfileInfo label="Supplier Name" value={supplierQuery} />
            <ProfileInfo label="PAN" value={pan} mono />
          </div>

          <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>All Vendor Codes Under This PAN</h3>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{codes.length} codes</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {codes.map((c) => (
                <span
                  key={c}
                  className={`chip mono ${c === supplierLoginVcode ? '' : 'gray'}`}
                  style={c === supplierLoginVcode ? { background: 'var(--brand-tint)', color: 'var(--brand)' } : undefined}
                >
                  {c}{c === supplierLoginVcode ? ' (this login)' : ''}
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
          {currentUser.dept && <p className="profile-dept">{currentUser.dept} Department</p>}
          <div className="profile-stats">
            <div>
              <div className="profile-stat-val">{scopedInvoices.length.toLocaleString()}</div>
              <div className="profile-stat-lbl">Invoices in scope</div>
            </div>
            <div>
              <div className="profile-stat-val">{openQueries}</div>
              <div className="profile-stat-lbl">Open queries</div>
            </div>
          </div>
        </div>

        <div className="card">
          <section className="profile-section">
            <h3>Personal information</h3>
            <p>Your details are managed by an administrator.</p>
            <div className="pf-grid">
              <ProfileField label="Full name" value={currentUser.fullName || currentUser.name} />
              <ProfileField label="Email" value={currentUser.email} />
              <ProfileField label="Job title" value={currentUser.title} />
              <ProfileField label="Role" value={role} />
              <ProfileField label="Access scope" value={accessScope} wide />
            </div>
          </section>

          <section className="profile-section">
            <h3>Security</h3>
            <p>Keep your account protected.</p>
            <div className="pf-row">
              <div>
                <div className="pf-row-title">Password</div>
                <div className="pf-row-desc">Change it regularly and never share it.</div>
              </div>
              <button type="button" className="btn" onClick={requestPasswordReset} disabled={sendingReset}>
                {sendingReset ? 'Sending…' : 'Change password'}
              </button>
            </div>
            <div className="pf-row">
              <div>
                <div className="pf-row-title">Two-factor authentication</div>
                <div className="pf-row-desc">{twoFactorOn ? 'On. A verification code is required at sign-in.' : 'Off. Add an extra verification step at sign-in.'}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={twoFactorOn}
                aria-label="Two-factor authentication"
                className={`toggle${twoFactorOn ? ' on' : ''}`}
                onClick={() => { dispatch(toggleTwoFactor()); dispatch(pushToast(!twoFactorOn ? 'Two-factor authentication enabled.' : 'Two-factor authentication disabled.')); }}
              ><div className="dot" /></button>
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
