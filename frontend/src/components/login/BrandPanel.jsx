import MpLogo from '../common/MpLogo.jsx';
import { WorkflowVisual } from './icons.jsx';

/** Left branded panel: the MPayVision lockup, the product line, and the workflow visual. */
export default function BrandPanel() {
  return (
    <section className="lgn-hero-left">
      <div className="lgn-hero-deco" aria-hidden="true">
        <span className="shard a" /><span className="shard b" /><span className="shard c" />
      </div>
      <div className="lgn-hero-content">
        <div className="lgn-mde" role="img" aria-label="MPayVision">
          <span className="lgn-mde-tile"><MpLogo size={52} /></span>
          <span className="lgn-mde-words" aria-hidden="true">
            <b>MPayVision</b>
          </span>
        </div>
        <span className="lgn-mde-rule" aria-hidden="true" />
        <h1 className="lgn-hero-product">Invoice to Payment Tracker</h1>
        <p className="lgn-hero-text">
          Simplifying invoice processing, approvals and payment tracking across Mahindra.
        </p>
        <WorkflowVisual />
      </div>
    </section>
  );
}
