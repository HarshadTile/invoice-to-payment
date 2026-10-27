import { useSelector } from 'react-redux';
import { useScope } from '../features/ui/scope';
import { runtime } from '../data/runtime';
import { CHANNEL_LABEL } from '../data/constants';
import { Building, Mail, Shield, User } from '../components/common/icons.jsx';

const TICKET_ROLE_LABEL = {
  ADMIN: 'Admin',
  CHANNEL_LEAD: 'Channel Lead',
  ASSIGNEE: 'Assignee',
  NO_ACCESS: 'No Inquiry Desk access',
};

/** Profile: a banner with who you are, then cards for contact, work and access details. Read-only. */
export default function ProfilePage() {
  const { authType, currentUser, supplierQuery, supplierPAN, supplierVendorCodes, channelScope, role, ticketRole } = useSelector((s) => s.auth);
  const scope = useScope();

  if (authType === 'supplier') {
    const pan = supplierPAN || runtime.invoices.find((invoice) => invoice.vcode === supplierVendorCodes?.[0])?.pan || '-';
    const codes = [...new Set(supplierVendorCodes || [])];
    const selectedCode = codes.length === 1 ? codes[0] : (codes.includes(scope.vcode) ? scope.vcode : '');
    const filterLabel = selectedCode || 'All assigned vendor codes';
    const initials = String(supplierQuery || 'S').trim().slice(0, 2).toUpperCase();
    return (
      <section className="pf-page">
        <Banner initials={initials} name={supplierQuery} subtitle="Supplier account" chips={[{ text: `Viewing ${filterLabel}`, tone: 'brand', mono: !!selectedCode }]} />
        <div className="pf-cards">
          <InfoCard icon={<Building />} title="Account">
            <Row label="Vendor code filter" value={filterLabel} mono={!!selectedCode} />
            <Row label="PAN" value={pan} mono />
          </InfoCard>
          <InfoCard icon={<Shield />} title="Vendor codes" hint={`${codes.length} ${codes.length === 1 ? 'code' : 'codes'}`}>
            <p className="pf-note">These vendor codes are assigned to your supplier account. Use the vendor-code selector in the top bar to filter invoices.</p>
            <div className="pf-codes">
              {codes.map((c) => (
                <span key={c} className={`pf-code${c === selectedCode ? ' current' : ''}`}>
                  {c}{c === selectedCode && <i>Selected</i>}
                </span>
              ))}
            </div>
          </InfoCard>
        </div>
      </section>
    );
  }

  const accessScope = channelScope === 'all' ? 'All channels (HQ / Admin)' : `${CHANNEL_LABEL[channelScope] || channelScope} only`;
  const ticketAccess = ticketRole ? (TICKET_ROLE_LABEL[String(ticketRole).toUpperCase()] || ticketRole) : '';

  return (
    <section className="pf-page">
      <Banner
        initials={currentUser.initials} name={currentUser.name}
        subtitle={[currentUser.title || role, currentUser.dept].filter(Boolean).join(' · ')}
        chips={[{ text: role }, { text: channelScope === 'all' ? 'All channels' : CHANNEL_LABEL[channelScope] || channelScope }].filter((c) => c.text)}
      />
      <div className="pf-cards">
        <InfoCard icon={<Mail />} title="Contact">
          <Row label="Full name" value={currentUser.fullName || currentUser.name} />
          <Row label="Email" value={currentUser.email} />
        </InfoCard>
        {/* Job title and department aren't entered when a user is added, so most accounts have neither:
            show this card only when there is something to show */}
        {(currentUser.title || currentUser.dept) && (
          <InfoCard icon={<User />} title="Work">
            {currentUser.title && <Row label="Job title" value={currentUser.title} />}
            {currentUser.dept && <Row label="Department" value={currentUser.dept} />}
          </InfoCard>
        )}
        <InfoCard icon={<Shield />} title="Access">
          <Row label="Role" value={role} />
          <Row label="Portal access" value={accessScope} />
          {ticketAccess && <Row label="Inquiry Desk" value={ticketAccess} />}
        </InfoCard>
      </div>
      <p className="pf-footnote">Contact your administrator to update your details or access.</p>
    </section>
  );
}

function Banner({ initials, name, subtitle, chips = [] }) {
  return (
    <div className="pf-banner">
      <div className="pf-cover" aria-hidden="true" />
      <div className="pf-identity">
        <div className="avatar pf-avatar" aria-hidden="true">{initials}</div>
        <div className="pf-who">
          <h2>{name}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {chips.length > 0 && (
          <div className="pf-chips">
            {chips.map((c) => <span key={c.text} className={`pf-chip${c.tone === 'brand' ? ' brand' : ''}${c.mono ? ' mono' : ''}`}>{c.text}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ icon, title, hint, wide = false, children }) {
  return (
    <section className={`pf-card${wide ? ' wide' : ''}`}>
      <header>
        <span className="pf-card-icon" aria-hidden="true">{icon}</span>
        <h3>{title}</h3>
        {hint && <span className="pf-card-hint">{hint}</span>}
      </header>
      <div className="pf-card-body">{children}</div>
    </section>
  );
}

function Row({ label, value, mono = false }) {
  return (
    <div className="pf-row">
      <span className="pf-label">{label}</span>
      <span className={`pf-value${mono ? ' mono' : ''}`}>{value || <span className="pf-empty">Not set</span>}</span>
    </div>
  );
}
