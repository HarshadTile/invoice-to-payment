/** Lets users choose the sign-in form that matches their account. */
export default function AccountTypeSelector({ value, onChange }) {
  return (
    <div className="lgn-seg" role="group" aria-label="Choose sign-in type">
      <button type="button" aria-pressed={value === 'internal'} data-active={value === 'internal'}
        onClick={() => onChange('internal')}>Internal Team</button>
      <button type="button" aria-pressed={value === 'supplier'} data-active={value === 'supplier'}
        onClick={() => onChange('supplier')}>Supplier</button>
    </div>
  );
}
