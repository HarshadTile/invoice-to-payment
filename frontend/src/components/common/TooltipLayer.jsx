import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const SHOW_DELAY = 280; // ms of hovering before a tip appears, so moving across the screen stays quiet
const GAP = 10; // space between the element and the tip
const MARGIN = 8; // minimum distance from the window edge

/**
 * One modern tooltip for the whole app. Any element with a `title` attribute gets it: while the
 * pointer (or keyboard focus) is on the element, the browser's own plain tooltip is suppressed by
 * lifting the `title` off and a styled tip is shown instead; the `title` is put back as soon as it
 * ends, so accessible names and tests that read it keep working. Mount it once, near the app root.
 */
export default function TooltipLayer() {
  const [tip, setTip] = useState(null); // { text, rect }
  const [pos, setPos] = useState(null); // { top, left, placement, arrow }
  const boxRef = useRef(null);
  const active = useRef(null); // { el, title } for the element currently holding the tip
  const timer = useRef(0);

  useEffect(() => {
    const restore = () => {
      const current = active.current;
      active.current = null;
      if (current && !current.el.hasAttribute('title')) current.el.setAttribute('title', current.title);
    };
    const hide = () => {
      window.clearTimeout(timer.current);
      restore();
      setTip(null);
      setPos(null);
    };
    const show = (el) => {
      const text = el.getAttribute('title');
      if (!text || !text.trim()) return;
      hide();
      el.removeAttribute('title'); // stops the browser's own tooltip
      active.current = { el, title: text };
      timer.current = window.setTimeout(() => {
        if (active.current?.el === el && el.isConnected) setTip({ text, rect: el.getBoundingClientRect() });
      }, SHOW_DELAY);
    };
    const target = (node) => (node instanceof Element ? node.closest('[title]') : null);

    const onOver = (e) => {
      if (active.current?.el.contains(e.target)) return; // still inside the element that has the tip
      const el = target(e.target);
      if (el) show(el);
    };
    const onOut = (e) => {
      const current = active.current;
      if (!current) return;
      if (e.relatedTarget instanceof Node && current.el.contains(e.relatedTarget)) return;
      hide();
    };
    const onFocus = (e) => {
      let visible = true;
      try { visible = e.target.matches(':focus-visible'); } catch { /* old engines: treat as visible */ }
      const el = visible ? target(e.target) : null;
      if (el) show(el);
    };

    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', hide);
    document.addEventListener('mousedown', hide);
    document.addEventListener('keydown', hide);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('mousedown', hide);
      document.removeEventListener('keydown', hide);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      hide();
    };
  }, []);

  // Once the tip is in the page, measure it and place it above the element (below if there is no room),
  // kept inside the window, with its arrow pointing at the element.
  useLayoutEffect(() => {
    if (!tip || !boxRef.current) return;
    const box = boxRef.current.getBoundingClientRect();
    const { rect } = tip;
    let placement = 'top';
    let top = rect.top - box.height - GAP;
    if (top < MARGIN) {
      placement = 'bottom';
      top = rect.bottom + GAP;
      if (top + box.height > window.innerHeight - MARGIN) { placement = 'top'; top = Math.max(MARGIN, rect.top - box.height - GAP); }
    }
    const center = rect.left + rect.width / 2;
    const left = Math.min(Math.max(MARGIN, center - box.width / 2), Math.max(MARGIN, window.innerWidth - box.width - MARGIN));
    const arrow = Math.min(Math.max(14, center - left), Math.max(14, box.width - 14));
    setPos({ top, left, placement, arrow });
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div
      ref={boxRef} role="tooltip"
      className={`app-tooltip${pos ? ` ${pos.placement}` : ' measuring'}`}
      style={pos ? { top: pos.top, left: pos.left, '--arrow': `${pos.arrow}px` } : { top: 0, left: 0 }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
