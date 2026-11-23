import { COLORS } from '@/constants/colors';
import SpotlightTour from '@/components/SpotlightTour';
import { useFocusEffect, useIsFocused } from 'expo-router';
import { Search } from 'lucide-react-native';
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
          body:has([id^="artfilier-chat-open-"]) .artfilier-guide-button { display: none; }
          body:has(#artfilier-message-button-workspace) .artfilier-guide-button { --artfilier-chat-offset: 60px; }
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
          .artfilier-guide-magnifier {
            position: absolute;
            inset: 0 0 0 auto;
            width: var(--artfilier-guide-size);
            display: grid;
            place-items: center;
          }
          .artfilier-guide-magnifier svg {
            width: 94%;
            height: 94%;
            filter: drop-shadow(0 2px 3px #40282426);
            transform-origin: 78% 78%;
          }
          .artfilier-guide-question {
            position: absolute;
            right: calc(var(--artfilier-guide-size) * .54 - 11px);
            top: calc(var(--artfilier-guide-size) * .46 - 11px);
            width: 22px;
            height: 22px;
            display: grid;
            place-items: center;
            color: ${COLORS.redDark};
            font: 800 21px/1 NunitoSans, sans-serif;
            -webkit-text-stroke: 2px ${COLORS.white};
            paint-order: stroke fill;
            pointer-events: none;
            transition: right 230ms cubic-bezier(.22, .68, .36, 1), top 230ms ease, transform 230ms ease;
          }
          .artfilier-guide-button:is(:hover, :focus-visible) .artfilier-guide-magnifier svg {
            animation: artfilier-guide-peek 460ms ease-in-out;
          }
          .artfilier-guide-button:is(:hover, :focus-visible) .artfilier-guide-question {
            right: calc(100% - 29px);
            top: calc((var(--artfilier-guide-size) - 22px) / 2);
            transform: rotate(-10deg);
          }
          @keyframes artfilier-guide-peek {
            35% { transform: translate(-3px, -2px) rotate(-17deg) scale(1.08); }
            70% { transform: translate(1px, 0) rotate(7deg); }
          }
          @media (prefers-reduced-motion: reduce) {
            .artfilier-guide-button, .artfilier-guide-paper, .artfilier-guide-question { transition: none; }
            .artfilier-guide-button:is(:hover, :focus-visible) .artfilier-guide-magnifier svg { animation: none; }
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
            bottom: bottom ?? (dialog ? 24 : `calc(${width >= 768 ? 24 : 96}px + var(--artfilier-chat-offset, 0px))`),
          } as CSSProperties}
        >
          <span className="artfilier-guide-paper" aria-hidden="true">Guide</span>
          <span className="artfilier-guide-magnifier" aria-hidden="true">
            <Search size={size} color={COLORS.red} fill={COLORS.roseLight} strokeWidth={2.5} />
          </span>
          <span className="artfilier-guide-question" aria-hidden="true">?</span>
        </button>
        </>,
        dialog ?? document.body,
      )}
      {activeStep !== null && (
        <SpotlightTour label={label} steps={steps} step={activeStep} scope={dialog ?? undefined} onNext={() => setStep(activeStep + 1)} onClose={() => setStep(null)} />
      )}
    </>
  );
}
