/** Compact, non-interactive label showing which portal this sign-in page is for. */
export default function AccountTypeSelector({ value }) {
  const label = value === 'supplier' ? 'Supplier sign in' : 'Internal Team sign in';
  return (
    <p className="lgn-portal-label">{label}</p>
  );
}
