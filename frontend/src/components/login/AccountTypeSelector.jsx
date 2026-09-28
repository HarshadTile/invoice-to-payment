/** Segmented control for choosing the account type. Controlled. */
export default function AccountTypeSelector({ value, onChange }) {
  return (
    <div className="lgn-seg" role="group" aria-label="Account type">
      <button type="button" aria-pressed={value === 'internal'} data-active={value === 'internal'}
        onClick={() => onChange('internal')}>Internal Team</button>
      <button type="button" aria-pressed={value === 'supplier'} data-active={value === 'supplier'}
        onClick={() => onChange('supplier')}>Supplier</button>
    </div>
  );
}
