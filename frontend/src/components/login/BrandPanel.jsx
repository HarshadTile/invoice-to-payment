import { WorkflowVisual } from './icons.jsx';

/** Left branded panel — messaging + subtle geometry + workflow visual. */
export default function BrandPanel() {
  return (
    <section className="lgn-hero-left">
      <div className="lgn-hero-deco" aria-hidden="true">
        <span className="shard a" /><span className="shard b" /><span className="shard c" />
      </div>
      <div className="lgn-hero-content">
        <p className="lgn-eyebrow">Finance &amp; Procurement</p>
        <h1 className="lgn-hero-title">Invoice to Payment{' '}<br />Tracker</h1>
        <p className="lgn-hero-text">
          Simplifying invoice processing, approvals and payment tracking across Mahindra.
        </p>
        <WorkflowVisual />
      </div>
    </section>
  );
}
