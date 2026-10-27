import { useEffect } from 'react';

// Best-effort browser deterrents: OS screenshot tools may not deliver key events,
// and a capture may occur before the browser paints this overlay.
export default function ContentProtection() {
  useEffect(() => {
    const isImage = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      for (let element: Element | null = target; element && element !== document.body; element = element.parentElement) {
        if (element.matches('img, [role="img"]') || getComputedStyle(element).backgroundImage !== 'none') return true;
      }
      return false;
    };
    const blockImageAction = (event: Event) => {
      if (isImage(event.target)) event.preventDefault();
    };
    const style = document.createElement('style');
    style.textContent = 'img, [role="img"] { -webkit-user-drag: none; -webkit-touch-callout: none; user-select: none; }';
    document.head.appendChild(style);
    const blackout = document.createElement('div');
    blackout.setAttribute('role', 'status');
    blackout.setAttribute('aria-live', 'polite');
    blackout.textContent = 'Preview temporarily hidden. Press Esc or click to continue.';
    Object.assign(blackout.style, {
      position: 'fixed', inset: '0', zIndex: '2147483647', background: '#000000',
      color: '#FFFFFF', display: 'none', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: '24px', fontFamily: 'NunitoSans, sans-serif', fontSize: '14px',
    });
    document.body.appendChild(blackout);
    let restoreTimer: ReturnType<typeof setTimeout> | undefined;
    const restore = () => {
      if (restoreTimer !== undefined) clearTimeout(restoreTimer);
      restoreTimer = undefined;
      blackout.style.display = 'none';
    };
    const isCaptureShortcut = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      return event.key === 'PrintScreen' || event.code === 'PrintScreen'
        || (event.metaKey && event.shiftKey && ['3', '4', '5', 's'].includes(key));
    };
    const hideForCaptureShortcut = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { restore(); return; }
      if (!isCaptureShortcut(event)) return;
      // Cancel only default actions the browser allows us to cancel.
      if (event.cancelable) event.preventDefault();
      blackout.style.display = 'flex';
      if (restoreTimer !== undefined) clearTimeout(restoreTimer);
      restoreTimer = setTimeout(restore, 1500);
    };
    blackout.addEventListener('click', restore);
    document.addEventListener('keydown', hideForCaptureShortcut, true);
    // Some platforms expose PrintScreen only on key release. This is a
    // deterrent after the event, not a claim that an earlier capture was blocked.
    document.addEventListener('keyup', hideForCaptureShortcut, true);

    document.addEventListener('contextmenu', blockImageAction, true);
    document.addEventListener('dragstart', blockImageAction, true);
    return () => {
      document.removeEventListener('contextmenu', blockImageAction, true);
      document.removeEventListener('dragstart', blockImageAction, true);
      document.removeEventListener('keydown', hideForCaptureShortcut, true);
      document.removeEventListener('keyup', hideForCaptureShortcut, true);
      blackout.removeEventListener('click', restore);
      restore();
      blackout.remove();
      style.remove();
    };
  }, []);
  return null;
}
