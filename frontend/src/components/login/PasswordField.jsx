import FormField from './FormField.jsx';
import { LockIcon, EyeIcon, EyeOffIcon } from './icons.jsx';

/** Password input with a label-row action slot and an accessible show/hide toggle. */
export default function PasswordField({
  id = 'lgn-password', label = 'Password', value, onChange, error, visible, onToggleVisible,
  labelAction, autoComplete = 'current-password', placeholder = 'Enter your password', autoFocus,
}) {
  return (
    <FormField
      id={id}
      label={label}
      labelAction={labelAction}
      error={error}
      icon={<LockIcon className="lgn-ic" />}
      type={visible ? 'text' : 'password'}
      autoComplete={autoComplete}
      autoFocus={autoFocus}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      trailing={(
        <button type="button" className="lgn-pw-toggle"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible} onClick={onToggleVisible}>
          {visible ? <EyeOffIcon width="16" height="16" /> : <EyeIcon width="16" height="16" />}
        </button>
      )}
    />
  );
}
