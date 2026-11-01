import { invoiceSteps } from '../../features/invoices/progress';
import { Check, X } from '../common/icons.jsx';

/** The Invoice Progress stepper, shared by the supplier's invoice page and the details popup. */
export default function InvoiceStepper({ inv }) {
  return (
    <ol className="inv-stepper">
      {invoiceSteps(inv).map(({ name, idx, state, date }) => (
        <li className={`inv-step ${state}`} key={name}>
          <span className="inv-step-dot" aria-hidden="true">
            {state === 'done' ? <Check size={12} /> : state === 'fail' ? <X size={12} /> : idx}
          </span>
          <span className="inv-step-text">
            <span className="inv-step-name">{name}</span>
            {state === 'current' && <span className="inv-step-state">In progress</span>}
            {date && <span className="inv-step-date">{date}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
