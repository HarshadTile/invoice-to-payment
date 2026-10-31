import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { CHANNEL_LABEL } from '../../data/constants';
import { defaultParentPath, pageHint, shortPageTitle } from '../../utils/pageTitle';
import { ArrowLeft } from '../common/icons.jsx';

/** "← Parent / Current": the parent label is the way back. Used above pages and in dialogs. */
export function Breadcrumb({ parent, current, onBack, hint }) {
  return (
    <nav className="back-banner" aria-label="Breadcrumb">
      <button type="button" aria-label={`Back to ${parent}`} onClick={onBack}><ArrowLeft size={15} />{parent}</button>
      <span className="back-sep" aria-hidden="true">/</span>
      <span className="back-here" aria-current="page">{current}</span>
      {hint && <span className="back-hint">{hint}</span>}
    </nav>
  );
}

// A page can name itself more precisely than its route title ("Paid invoices · Mar 2026").
const LabelContext = createContext({ setLabel: () => {} });

export function BreadcrumbProvider({ children }) {
  const [label, setLabel] = useState(null);
  return <LabelContext.Provider value={{ label, setLabel }}>{children}</LabelContext.Provider>;
}

/** Override the current page's breadcrumb label while this page is shown (null = route title). */
export function useBreadcrumbLabel(label) {
  const { setLabel } = useContext(LabelContext);
  useEffect(() => { setLabel(label || null); }, [label, setLabel]);
  useEffect(() => () => setLabel(null), [setLabel]);
}

/**
 * The breadcrumb above every page. It remembers which page each history entry was opened from:
 * a new page (PUSH) records the page before it, a filter change that rewrites the URL (REPLACE)
 * keeps the same parent, and Back / Forward (POP) finds what was recorded. With a known previous
 * page the parent link is navigate(-1), so that page returns with its URL and filters intact;
 * otherwise it opens the page's natural parent, and the home page shows no breadcrumb.
 */
export function PageBreadcrumb() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  const { label } = useContext(LabelContext);
  const { authType, channelScope } = useSelector((s) => s.auth);
  const locked = authType === 'internal' && channelScope !== 'all' ? (CHANNEL_LABEL[channelScope] || channelScope) : '';

  const fromByKey = useRef(new Map());
  const last = useRef(null);
  if (last.current?.key !== location.key) {
    const previous = last.current;
    if (previous && navigationType === 'PUSH') fromByKey.current.set(location.key, previous);
    if (previous && navigationType === 'REPLACE' && fromByKey.current.has(previous.key)) {
      fromByKey.current.set(location.key, fromByKey.current.get(previous.key));
    }
    last.current = { key: location.key, pathname: location.pathname };
  }

  // An open invoice on My Invoices shows its own "← My Invoices / Invoice …" breadcrumb.
  if (location.pathname.startsWith('/supplier/home') && new URLSearchParams(location.search).has('open')) return null;

  const from = fromByKey.current.get(location.key);
  const current = label || shortPageTitle(location.pathname, locked);
  if (from && from.pathname !== location.pathname) {
    return <Breadcrumb parent={shortPageTitle(from.pathname, locked)} current={current} onBack={() => navigate(-1)} hint={pageHint(location.pathname)} />;
  }
  const parentPath = defaultParentPath(location.pathname, authType);
  if (!parentPath || !current) return null;
  return <Breadcrumb parent={shortPageTitle(parentPath, locked)} current={current} onBack={() => navigate(parentPath)} hint={pageHint(location.pathname)} />;
}
