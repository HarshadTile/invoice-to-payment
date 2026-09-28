/** Labelled input with a leading icon, focus/error states and an inline message.
 *
 * Props:
 *  - id, label            required
 *  - icon                 element (leading icon component instance)
 *  - error                string | falsy
 *  - labelAction          node rendered on the right of the label row
 *  - trailing             node rendered inside the field on the right (e.g. a toggle)
 *  - note                 secondary caption under the field
 *  - ...inputProps        spread onto the <input>
 */
export default function FormField({
  id, label, icon, error, labelAction, trailing, note, ...inputProps
}) {
  const msgId = error ? `${id}-err` : undefined;
  return (
    <div className="lgn-field">
      <div className="lgn-label-row">
        <label htmlFor={id}>{label}</label>
        {labelAction}
      </div>
      <div className="lgn-input">
        {icon}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={msgId}
          {...inputProps}
        />
        {trailing}
      </div>
      {note && !error ? (
        <span className="lgn-field-note">{note}</span>
      ) : (
        <span
          id={msgId}
          className="lgn-field-msg"
          aria-hidden={error ? undefined : true}
        >
          {error || '\u00a0'}
        </span>
      )}
    </div>
  );
}
