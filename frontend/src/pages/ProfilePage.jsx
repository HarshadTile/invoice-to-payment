import { useDispatch, useSelector } from 'react-redux';
import { vendorCodesFor } from '../utils/businessLogic';
import { runtime } from '../data/runtime';
import { toggleTwoFactor } from '../features/settings/settingsSlice';
import { pushToast } from '../features/ui/uiSlice';

export default function ProfilePage() {
  const { authType, currentUser, supplierQuery, supplierPAN, supplierLoginVcode, channelScope, role } = useSelector((s) => s.auth);
  const dispatch = useDispatch();
  const twoFactorOn = useSelector((s) => s.settings.twoFactorOn);

  if (authType === 'supplier') {
    const pan = runtime.invoices.find((invoice) => invoice.vcode === supplierLoginVcode)?.pan || supplierPAN || '-';
    const codes = vendorCodesFor(supplierQuery);
    return (
      <>
        <h1 className="page-title">My Profile</h1>
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

  return (
    <>
      <h1 className="page-title">User Profile</h1>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="card" style={{ width: 260, maxWidth: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="avatar" style={{ width: 80, height: 80, fontSize: 26, margin: '0 auto 10px' }}>{currentUser.initials}</div>
            <b>{currentUser.name}</b>
            <p style={{ color: 'var(--brand)', fontSize: 12.5, margin: '2px 0' }}>{currentUser.title}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{currentUser.dept} Department</p>
          </div>
          <div className="row" style={{ textAlign: 'center', marginTop: 14 }}>
            <div style={{ flex: 1 }}><b>412</b><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>INVOICES TRACKED</div></div>
            <div style={{ flex: 1 }}><b>96%</b><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>SLA MET</div></div>
          </div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 'min(320px, 100%)' }}>
          <h3>Personal Information</h3>
          <div className="row">
            <div className="form-field" style={{ flex: 1 }}><label>Full Name</label><input value={currentUser.fullName || currentUser.name} readOnly /></div>
            <div className="form-field" style={{ flex: 1 }}><label>Email</label><input value={currentUser.email} readOnly /></div>
          </div>
          <div className="row">
            <div className="form-field" style={{ flex: 1 }}><label>Job Title</label><input value={currentUser.title} readOnly /></div>
            <div className="form-field" style={{ flex: 1 }}><label>Role</label><input value={role} readOnly /></div>
          </div>
          <div className="form-field"><label>Access Scope</label><input value={channelScope === 'all' ? 'All Channels (HQ / Admin)' : 'Internal Team'} readOnly /></div>
          <h3 style={{ marginTop: 20 }}>Security</h3>
          <div className="validation-row">
            <span>Password: last changed 2 months ago</span>
            <button type="button" className="btn" onClick={() => dispatch(pushToast('Password change link sent to your email.'))}>Change Password</button>
          </div>
          <div className="validation-row">
            <span>Two-Factor Authentication</span>
            <button type="button" className={`toggle${twoFactorOn ? ' on' : ''}`} onClick={() => { dispatch(toggleTwoFactor()); dispatch(pushToast(!twoFactorOn ? 'Two-Factor Authentication enabled.' : 'Two-Factor Authentication disabled.')); }}><div className="dot" /></button>
          </div>
        </div>
      </div>
    </>
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
