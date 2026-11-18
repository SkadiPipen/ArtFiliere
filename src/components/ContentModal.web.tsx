import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type ReactPortal } from 'react';
import { useIsFocused } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { Modal } from 'react-native';
import type { ContentModalProps } from './ContentModal';

const { createPortal } = require('react-dom') as {
  createPortal: (children: ReactNode, container: HTMLElement) => ReactPortal;
};
const ModalHost = createContext<HTMLDivElement | null>(null);

export function ContentModalRegion({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  return (
    <ModalHost.Provider value={enabled ? host : null}>
      {children}
      {enabled && <div ref={setHost} style={{ position: 'absolute', inset: 0, zIndex: 30, pointerEvents: 'none' }} />}
    </ModalHost.Provider>
  );
}

export default function ContentModal({ children, ...props }: ContentModalProps) {
  const host = useContext(ModalHost);
  const focused = useIsFocused();
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(props.onRequestClose);
  close.current = props.onRequestClose;
  const visible = props.visible !== false && focused;

  useEffect(() => {
    const element = dialog.current;
    if (!host || !visible || !element) return;
    const previous = document.activeElement;
    element.focus({ preventScroll: true });
    function dismiss(event: KeyboardEvent) {
      if (event.key === 'Escape' && host?.lastElementChild === element) {
        event.preventDefault();
        close.current?.();
      }
    }
    window.addEventListener('keydown', dismiss);
    return () => {
      window.removeEventListener('keydown', dismiss);
      if (previous instanceof HTMLElement && previous.isConnected && (
        element.contains(document.activeElement) || document.activeElement === document.body
      )) previous.focus({ preventScroll: true });
    };
  }, [host, visible]);

  if (!host) return <Modal {...props}>{children}</Modal>;
  if (!visible) return null;

  return createPortal(
    <div
      ref={dialog}
      role="dialog"
      data-artfilier-content-modal=""
      aria-label={props.accessibilityLabel}
      tabIndex={-1}
      style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: props.transparent ? 'transparent' : COLORS.pageBackground, outline: 'none', pointerEvents: 'auto' }}
    >
      {children}
    </div>,
    host,
  );
}
