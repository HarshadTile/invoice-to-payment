/** Full-width primary CTA with loading / success / disabled states.
 */
export default function PrimaryButton({ loading, done, disabled, children = 'Continue', ...rest }) {
  return (
    <button type="submit" className="lgn-submit" disabled={disabled || loading || done} {...rest}>
      {loading && <span className="lgn-spinner" aria-hidden="true" />}
      {loading ? 'Signing in…' : done ? 'Signed in' : children}
    </button>
  );
}
