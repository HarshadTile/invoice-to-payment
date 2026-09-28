/* Shared inline icons for the login screen. Decorative — always aria-hidden. */

const Ic = ({ d, ...p }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    {d}
  </svg>
);

export const IdIcon = (p) => <Ic {...p} d={<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M13 10h5M13 14H7" /></>} />;
export const LockIcon = (p) => <Ic {...p} d={<><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>} />;
export const BuildingIcon = (p) => <Ic {...p} d={<><rect x="5" y="3" width="14" height="18" rx="1.5" /><path d="M9 7h.01M12 7h.01M15 7h.01M9 11h.01M12 11h.01M15 11h.01M10 21v-4h4v4" /></>} />;
export const HashIcon = (p) => <Ic {...p} d={<><path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16" /></>} />;
export const CaretIcon = (p) => <Ic {...p} d={<path d="m6 9 6 6 6-6" />} />;
export const EyeIcon = (p) => <Ic {...p} d={<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>} />;
export const EyeOffIcon = (p) => <Ic {...p} d={<><path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.1A9.5 9.5 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.5 6.5A17 17 0 0 0 2 12s4 7 10 7a9.4 9.4 0 0 0 3.5-.7" /></>} />;
export const AlertIcon = (p) => <Ic {...p} d={<><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>} />;
export const CheckIcon = (p) => <Ic {...p} d={<><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>} />;

/* Abstract, non-cartoon invoice → approval → payment workflow. */
export function WorkflowVisual() {
  return (
    <svg className="lgn-hero-visual" viewBox="0 0 520 300" fill="none" aria-hidden="true">
      <defs>
        <pattern id="lgnGrid" width="26" height="26" patternUnits="userSpaceOnUse">
          <path d="M26 0H0V26" stroke="rgba(255,255,255,.06)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="520" height="300" fill="url(#lgnGrid)" />
      <g stroke="rgba(255,255,255,.55)" strokeWidth="1.5">
        <rect x="46" y="70" width="150" height="180" rx="10" fill="rgba(255,255,255,.05)" />
        <rect x="64" y="52" width="150" height="180" rx="10" fill="rgba(255,255,255,.09)" />
        <path d="M84 78h110M84 100h110M84 122h72M84 150h110M84 172h88M84 194h110" strokeWidth="3" strokeLinecap="round" stroke="rgba(255,255,255,.4)" />
      </g>
      <path d="M214 142h70c14 0 14 -60 28 -60h60" stroke="rgba(255,255,255,.5)" strokeWidth="2" />
      <path d="M214 142h70c14 0 14 60 28 60h60" stroke="rgba(255,255,255,.28)" strokeWidth="2" />
      {[[214, 142], [312, 82], [312, 202], [372, 82], [372, 202]].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="5" fill="#fff" opacity=".85" />
      ))}
      <circle cx="430" cy="82" r="26" fill="rgba(255,255,255,.12)" stroke="#fff" strokeWidth="2" />
      <path d="m418 82 8 8 16-18" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="402" y="176" width="86" height="34" rx="8" fill="rgba(255,255,255,.12)" stroke="#fff" strokeWidth="1.5" />
      <path d="M416 193h20M416 199h30" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".8" />
    </svg>
  );
}
