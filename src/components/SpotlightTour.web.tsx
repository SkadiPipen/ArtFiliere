import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type ReactPortal } from 'react';
import { COLORS } from '@/constants/colors';
import type { SpotlightTourProps } from './SpotlightTour';

const { createPortal } = require('react-dom') as {
  createPortal: (children: ReactNode, container: HTMLElement) => ReactPortal;
};
const padding = 12;
const gap = 19;

function visibleBounds(element: HTMLElement) {
  const bounds = element.getBoundingClientRect();
  let left = Math.max(0, bounds.left);
  let top = Math.max(0, bounds.top);
  let right = Math.min(window.innerWidth, bounds.right);
  let bottom = Math.min(window.innerHeight, bounds.bottom);
  for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(parent);
    if (overflowX === 'visible' && overflowY === 'visible') continue;
    const bounds = parent.getBoundingClientRect();
    if (overflowX !== 'visible') {
      left = Math.max(left, bounds.left + parent.clientLeft);
      right = Math.min(right, bounds.left + parent.clientLeft + parent.clientWidth);
    }
    if (overflowY !== 'visible') {
      top = Math.max(top, bounds.top + parent.clientTop);
      bottom = Math.min(bottom, bounds.top + parent.clientTop + parent.clientHeight);
    }
  }
  return right > left && bottom > top ? new DOMRect(left, top, right - left, bottom - top) : undefined;
}

export default function SpotlightTour({ label, steps, step, onNext, onClose, scope }: SpotlightTourProps) {
  const { target, instruction, closeOnActivate } = steps[step];
  const last = step === steps.length - 1;
  const card = useRef<HTMLElement>(null);
  const scrollOrigins = useRef(new Map<Element, { top: number; left: number }>());
  const [layout, setLayout] = useState<{ target: string; rect?: DOMRect; width: number; height: number; cardHeight: number }>();
  const close = useRef(onClose);
  useLayoutEffect(() => { close.current = onClose; }, [onClose]);

  useLayoutEffect(() => {
    const page = window.location.href;
    const origins = scrollOrigins.current;
    return () => {
      for (const [element, position] of origins) {
        const pageScroll = element === document.scrollingElement;
        if (element.isConnected && (!pageScroll || window.location.href === page)) {
          element.scrollTo({ ...position, behavior: 'instant' });
        }
      }
      origins.clear();
    };
  }, []);

  useLayoutEffect(() => {
    let frame = 0;
    let control: HTMLElement | undefined;
    let previousLayout: typeof layout;
    const selector = `#${CSS.escape(target)}`;
    const root = scope ?? document;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const activate = () => close.current();
    const hasBox = (element: HTMLElement) => element.getClientRects().length > 0 && getComputedStyle(element).visibility === 'visible';

    function measure() {
      const nextControl = control?.isConnected && hasBox(control)
        ? control
        : Array.from(root.querySelectorAll<HTMLElement>(selector)).find(hasBox);
      if (nextControl !== control) {
        control?.removeEventListener('click', activate);
        control = nextControl;
        const origins = scrollOrigins.current;
        for (let element = control?.parentElement; element; element = element.parentElement) {
          const canScroll = element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth;
          if ((canScroll || element === document.scrollingElement) && !origins.has(element)) {
            origins.set(element, { top: element.scrollTop, left: element.scrollLeft });
          }
        }
        control?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'center', inline: 'nearest' });
        if (closeOnActivate) control?.addEventListener('click', activate);
      }
      const rect = control ? visibleBounds(control) : undefined;
      const nextLayout = {
        target, rect,
        width: window.innerWidth,
        height: window.innerHeight,
        cardHeight: card.current?.offsetHeight ?? 120,
      };
      const oldRect = previousLayout?.rect;
      if (!previousLayout || previousLayout.width !== nextLayout.width || previousLayout.height !== nextLayout.height ||
          previousLayout.cardHeight !== nextLayout.cardHeight || oldRect?.x !== rect?.x || oldRect?.y !== rect?.y ||
          oldRect?.width !== rect?.width || oldRect?.height !== rect?.height) {
        previousLayout = nextLayout;
        setLayout(nextLayout);
      }
      frame = requestAnimationFrame(measure);
    }
    measure();
    return () => {
      cancelAnimationFrame(frame);
      control?.removeEventListener('click', activate);
    };
  }, [target, scope, closeOnActivate]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close.current();
    };
    window.addEventListener('keydown', closeOnEscape, true);
    return () => {
      window.removeEventListener('keydown', closeOnEscape, true);
    };
  }, []);

  if (typeof document === 'undefined') return null;
  const { rect, width, height, cardHeight } = layout?.target === target ? layout : { rect: undefined, width: window.innerWidth, height: window.innerHeight, cardHeight: 120 };
  const cardWidth = Math.min(254, width - padding * 2);
  const center = rect ? rect.left + rect.width / 2 : width / 2;
  const besideRight = !!rect && rect.right + gap + cardWidth <= width - padding;
  const besideLeft = !!rect && !besideRight && rect.left - gap - cardWidth >= padding;
  const x = besideRight ? rect.right + gap : besideLeft ? rect.left - gap - cardWidth : Math.max(padding, Math.min(center - cardWidth / 2, width - cardWidth - padding));
  const below = !!rect && (rect.bottom + cardHeight + gap <= height - padding ||
    (rect.top - cardHeight - gap < padding && height - rect.bottom >= rect.top));
  const centerY = rect ? rect.top + rect.height / 2 : height / 2;
  const preferredY = rect && !besideRight && !besideLeft ? (below ? rect.bottom + gap : rect.top - cardHeight - gap) : centerY - cardHeight / 2;
  const y = Math.max(padding, Math.min(preferredY, height - cardHeight - padding));
  const arrowX = Math.max(12, Math.min(center - x - 5, cardWidth - 22));
  const arrowY = Math.max(10, Math.min(centerY - y - 5, cardHeight - 20));
  const left = rect ? Math.max(0, rect.left - 5) : 0;
  const right = rect ? Math.min(width, rect.right + 5) : 0;
  const top = rect ? Math.max(0, rect.top - 5) : 0;
  const bottom = rect ? Math.min(height, rect.bottom + 5) : 0;
  const shade = [
    { left: 0, top: 0, width, height: top },
    { left: 0, top, width: left, height: bottom - top },
    { left: right, top, width: width - right, height: bottom - top },
    { left: 0, top: bottom, width, height: height - bottom },
  ];

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, pointerEvents: 'none', fontFamily: 'NunitoSans, sans-serif' }}>
      {shade.map((area, index) => <div key={index} aria-hidden="true" style={{ position: 'absolute', ...area, background: '#21151BD1', pointerEvents: 'auto' }} />)}
      {rect && (
        <>
          <div aria-hidden="true" style={{ position: 'absolute', left, top, width: right - left, height: bottom - top, boxSizing: 'border-box', border: `5px double ${COLORS.red}`, borderRadius: 8 }} />
          <svg
            aria-hidden="true"
            viewBox="0 0 34 68"
            fill={COLORS.red}
            style={{ position: 'absolute', left: Math.max(0, left - 13), top: Math.max(0, Math.min(height - 48, (top + bottom - 48) / 2)), width: 24, height: 48, filter: 'drop-shadow(0 0 2px #FFF9F3)' }}
          >
            <path d="M16 0C17 18 21 25 31 29C21 33 17 40 16 57C15 40 11 33 1 29C11 25 15 18 16 0Z" />
            <path d="M25 41C26 49 28 53 34 55C28 57 26 61 25 68C24 61 22 57 16 55C22 53 24 49 25 41Z" />
          </svg>
        </>
      )}
      <button type="button" aria-label={`Close ${label}`} onClick={onClose} style={{ position: 'absolute', top: 12, left: 12, zIndex: 1, background: '#302329', color: '#fff', border: '1px solid #FFFFFF80', borderRadius: 6, width: 36, height: 36, fontSize: 24, cursor: 'pointer', pointerEvents: 'auto' }}>×</button>
      <section ref={card} aria-label={label} style={{ position: 'absolute', left: x, top: y, width: cardWidth, boxSizing: 'border-box', pointerEvents: 'auto' }}>
        <div style={{ position: 'relative', background: '#FFF9F3', color: '#35272A', padding: 12, borderRadius: 6, boxShadow: '0 3px 14px #0005' }}>
          {rect && <span aria-hidden="true" style={{ position: 'absolute', ...(besideRight || besideLeft ? { [besideRight ? 'left' : 'right']: -5, top: arrowY } : { left: arrowX, [below ? 'top' : 'bottom']: -5 }), width: 10, height: 10, background: '#FFF9F3', transform: 'rotate(45deg)' }} />}
          <div aria-live="polite" style={{ fontSize: 14, lineHeight: '19px' }}>{instruction}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, fontSize: 12 }}>
            <span>{step + 1}/{steps.length}</span>
            <button type="button" onClick={last ? onClose : onNext} style={{ cursor: 'pointer', background: '#84302C', color: '#fff', border: 0, borderRadius: 4, padding: '6px 14px', fontWeight: 700 }}>{last ? 'Done' : 'Next'}</button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
