import { COLORS } from '@/constants/colors';
import SpotlightTour from '@/components/SpotlightTour';
import { useFocusEffect, useIsFocused } from 'expo-router';
import { Paintbrush } from 'lucide-react-native';
import { useCallback, useState, type CSSProperties, type ReactNode, type ReactPortal } from 'react';
import { useWindowDimensions } from 'react-native';
import type { TourLauncherProps } from './TourLauncher';

const { createPortal } = require('react-dom') as {
  createPortal: (children: ReactNode, container: HTMLElement) => ReactPortal;
};

export default function TourLauncher({ label, steps, bottom, right = 20, size = 52, controller }: TourLauncherProps) {
  const [localStep, setLocalStep] = useState<number | null>(null);
  const [origin, setOrigin] = useState<HTMLSpanElement | null>(null);
  const focused = useIsFocused();
  const { width } = useWindowDimensions();
  useFocusEffect(useCallback(() => () => setLocalStep(null), []));

  if (!focused || !steps.length) return null;

  const step = controller ? controller.step : localStep;
  const setStep = controller?.onStep ?? setLocalStep;
  const activeStep = step === null ? null : Math.min(step, steps.length - 1);
  const dialog = origin?.closest<HTMLElement>('[role="dialog"]');
  const scoped = dialog?.hasAttribute('data-artfilier-content-modal');

  return (
    <>
      <span ref={setOrigin} hidden />
      {origin && createPortal(
        <>
        <style>{`
          .artfilier-guide-button {
            width: var(--artfilier-guide-size);
            height: var(--artfilier-guide-size);
            padding: 0;
            border: 0;
            border-radius: 22px;
            background: transparent;
            cursor: pointer;
            transition: width 230ms cubic-bezier(.22, .68, .36, 1);
          }
          .artfilier-guide-button:is(:hover, :focus-visible) { width: calc(var(--artfilier-guide-size) + 98px); }
          .artfilier-guide-button:focus-visible { outline: 2px solid ${COLORS.redDark}; outline-offset: 3px; }
          .artfilier-guide-paper {
            position: absolute;
            inset: 8px calc(var(--artfilier-guide-size) / 2) 8px 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding-inline: 18px 16px;
            border: 1px solid ${COLORS.red};
            border-radius: 7px;
            background: linear-gradient(90deg, ${COLORS.roseLight}, ${COLORS.white} 48%, ${COLORS.roseLight});
            color: ${COLORS.redDark};
            font: 700 14px NunitoSans, sans-serif;
            box-shadow: 0 3px 9px #40282422;
            opacity: 0;
            transform: scaleX(0);
            transform-origin: right center;
            transition: transform 230ms cubic-bezier(.22, .68, .36, 1), opacity 150ms ease;
          }
          .artfilier-guide-button:is(:hover, :focus-visible) .artfilier-guide-paper {
            opacity: 1;
            transform: scaleX(1);
          }
          .artfilier-guide-palette {
            position: absolute;
            inset: 0 0 0 auto;
            width: var(--artfilier-guide-size);
            display: grid;
            place-items: center;
          }
          .artfilier-guide-palette-icon {
            width: 100%;
            height: 100%;
            filter: drop-shadow(0 2px 3px #40282426);
            transition: transform 230ms cubic-bezier(.22, .68, .36, 1);
          }
          .artfilier-guide-brush {
            position: absolute;
            right: 0;
            bottom: 4px;
            width: 22px;
            height: 22px;
            display: grid;
            place-items: center;
            filter: drop-shadow(0 0 1px ${COLORS.white}) drop-shadow(0 0 1px ${COLORS.white});
            transform: rotate(-8deg);
            transition: right 230ms cubic-bezier(.22, .68, .36, 1), bottom 230ms ease, transform 230ms ease;
          }
          .artfilier-guide-button:is(:hover, :focus-visible) .artfilier-guide-palette-icon {
            transform: rotate(-32deg);
          }
          .artfilier-guide-button:is(:hover, :focus-visible) .artfilier-guide-brush {
            right: calc(100% - 22px);
            bottom: calc((var(--artfilier-guide-size) - 22px) / 2);
            transform: rotate(-43deg) scale(1.18);
          }
          @media (prefers-reduced-motion: reduce) {
            .artfilier-guide-button, .artfilier-guide-paper, .artfilier-guide-palette-icon, .artfilier-guide-brush { transition: none; }
          }
        `}</style>
        <button
          type="button"
          className="artfilier-guide-button"
          aria-label={label}
          title={label}
          onClick={() => setStep(0)}
          style={{
            '--artfilier-guide-size': `${size}px`,
            position: scoped ? 'absolute' : 'fixed',
            zIndex: 21,
            right,
            bottom: bottom ?? (dialog || width >= 768 ? 24 : 96),
          } as CSSProperties}
        >
          <span className="artfilier-guide-paper" aria-hidden="true">Guide</span>
          <span className="artfilier-guide-palette" aria-hidden="true">
            <svg className="artfilier-guide-palette-icon" viewBox="0 0 52 52" fill={COLORS.red} aria-hidden="true">
              <path fillRule="evenodd" d="M27 2C13 2 2 12.4 2 26.1 2 39 12.3 49 24.4 49c6 0 8.2-3.2 6.6-7.6-1.4-3.9.2-6.7 4.7-6.1 8.2 1.1 14.3-4.4 14.3-12.1C50 11.5 39.8 2 27 2ZM18 14a3.6 3.6 0 1 0 0 .01ZM29 10a3.6 3.6 0 1 0 0 .01ZM40 15a3.6 3.6 0 1 0 0 .01ZM14 26a3.6 3.6 0 1 0 0 .01ZM39 25c0 2 1.9 3.3 4.2 3.3 2.2 0 4-1.3 4-3.3s-1.8-3.4-4-3.4-4.2 1.4-4.2 3.4Z" />
            </svg>
          </span>
          <span className="artfilier-guide-brush" aria-hidden="true">
            <Paintbrush size={20} color={COLORS.redDark} aria-hidden />
          </span>
        </button>
        </>,
        dialog ?? document.body,
      )}
      {activeStep !== null && (
        <SpotlightTour label={label} steps={steps} step={activeStep} onNext={() => setStep(activeStep + 1)} onClose={() => setStep(null)} />
      )}
    </>
  );
}
