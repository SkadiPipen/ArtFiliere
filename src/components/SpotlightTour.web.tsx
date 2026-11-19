import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type ReactPortal } from 'react';
import { COLORS } from '@/constants/colors';
import type { SpotlightTourProps } from './SpotlightTour';

const { createPortal } = require('react-dom') as {
  createPortal: (children: ReactNode, container: HTMLElement) => ReactPortal;
};
const padding = 12;

export default function SpotlightTour({ label, steps, step, onNext, onClose }: SpotlightTourProps) {
  const { target, instruction, closeOnActivate } = steps[step];
  const last = step === steps.length - 1;
  const card = useRef<HTMLElement>(null);
  const scrollOrigins = useRef(new Map<Element, { top: number; left: number }>());
  const [layout, setLayout] = useState<{ rect?: DOMRect; width: number; height: number; cardHeight: number }>();

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

  useEffect(() => {
    let frame = 0;
    let scrollingToTarget = true;
    function measure() {
      const rect = document.getElementById(target)?.getBoundingClientRect();
      const visible = rect?.width && rect.height && rect.bottom > 0 && rect.top < window.innerHeight;
      setLayout((previous) => ({
        rect: visible ? rect : rect && scrollingToTarget ? previous?.rect : undefined,
        width: window.innerWidth,
        height: window.innerHeight,
        cardHeight: card.current?.offsetHeight ?? 120,
      }));
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const control = document.getElementById(target);
    const origins = scrollOrigins.current;
    for (let element = control?.parentElement; element; element = element.parentElement) {
      const canScroll = element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth;
      if ((canScroll || element === document.scrollingElement) && !origins.has(element)) {
        origins.set(element, { top: element.scrollTop, left: element.scrollLeft });
      }
    }
    control?.scrollIntoView({
      behavior: reducedMotion ? 'instant' : 'smooth',
      block: 'center',
      inline: 'nearest',
    });
    const settle = window.setTimeout(() => {
      scrollingToTarget = false;
      schedule();
    }, reducedMotion ? 0 : 700);
    const observer = new ResizeObserver(schedule);
    if (card.current) observer.observe(card.current);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    schedule();
    return () => {
      window.clearTimeout(settle);
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [target]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', closeOnEscape, true);
    const control = closeOnActivate ? document.getElementById(target) : null;
    control?.addEventListener('click', onClose);
    return () => {
      window.removeEventListener('keydown', closeOnEscape, true);
      control?.removeEventListener('click', onClose);
    };
  }, [closeOnActivate, onClose, target]);

  if (typeof document === 'undefined') return null;
  const { rect, width, height, cardHeight } = layout ?? { width: window.innerWidth, height: window.innerHeight, cardHeight: 120 };
  const cardWidth = Math.min(254, width - padding * 2);
  const center = rect ? rect.left + rect.width / 2 : width / 2;
  const beside = !!rect && rect.left < width / 3 && rect.right + 19 + cardWidth <= width - padding;
  const x = beside ? rect.right + 19 : Math.max(padding, Math.min(center - cardWidth / 2, width - cardWidth - padding));
  const below = !!rect && rect.bottom + cardHeight + 19 <= height - padding;
  const centerY = rect ? rect.top + rect.height / 2 : height / 2;
  const preferredY = rect && !beside ? (below ? rect.bottom + 19 : rect.top - cardHeight - 19) : centerY - cardHeight / 2;
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
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .artfilier-tour-slide {
            transition-property: left, top, width, height;
            transition-duration: 160ms;
            transition-timing-function: cubic-bezier(.22, .68, .36, 1);
          }
        }
      `}</style>
      {shade.map((area, index) => <div key={index} aria-hidden="true" className="artfilier-tour-slide" style={{ position: 'absolute', ...area, background: '#21151BD1', pointerEvents: 'auto' }} />)}
      {rect && (
        <>
          <div aria-hidden="true" className="artfilier-tour-slide" style={{ position: 'absolute', left, top, width: right - left, height: bottom - top, boxSizing: 'border-box', border: `5px double ${COLORS.red}`, borderRadius: 8 }} />
          <svg
            aria-hidden="true"
            className="artfilier-tour-slide"
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
      <section ref={card} aria-label={label} className="artfilier-tour-slide" style={{ position: 'absolute', left: x, top: y, width: cardWidth, boxSizing: 'border-box', pointerEvents: 'auto' }}>
        <div style={{ position: 'relative', background: '#FFF9F3', color: '#35272A', padding: 12, borderRadius: 6, boxShadow: '0 3px 14px #0005' }}>
          {rect && <span aria-hidden="true" style={{ position: 'absolute', ...(beside ? { left: -5, top: arrowY } : { left: arrowX, [below ? 'top' : 'bottom']: -5 }), width: 10, height: 10, background: '#FFF9F3', transform: 'rotate(45deg)' }} />}
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
