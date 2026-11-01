import AppHeader from './AppHeader.jsx';
import BrandPanel from './BrandPanel.jsx';

/** The frame every sign-in page shares: header, brand panel and the white card with its heading.
 *  `subtitle` is left out when empty; `outside` renders after the frame (e.g. a dialog). */
export default function AuthLayout({ kicker, title, subtitle, cardClassName = '', footer, outside, children }) {
  return (
    <div className="lgn-page">
      <AppHeader />
      <div className="lgn-hero">
        <BrandPanel />
        <section className="lgn-hero-right">
          <div className={`lgn-card${cardClassName ? ` ${cardClassName}` : ''}`}>
            <div className="lgn-card-head">
              <p className="lgn-kicker">{kicker}</p>
              <h2>{title}</h2>
              {subtitle && <p className="lgn-card-sub">{subtitle}</p>}
            </div>
            {children}
            {footer}
          </div>
        </section>
      </div>
      {outside}
    </div>
  );
}
