/** The MPayVision "MP" monogram (same drawing as public/favicon.svg). Decorative: the product name
 *  is always written next to it, so screen readers skip the picture. */
export default function MpLogo({ size = 22, className = '' }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" fill="#C8102E" />
      <path d="M10 46V18l10 15 10-15v28" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M38 46V18h8a8 8 0 0 1 0 16h-8" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
