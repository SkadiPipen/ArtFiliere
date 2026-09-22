import { useEffect } from 'react';

// Browser deterrents only: web pages cannot block OS-level screenshots.
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
    document.addEventListener('contextmenu', blockImageAction, true);
    document.addEventListener('dragstart', blockImageAction, true);
    return () => {
      document.removeEventListener('contextmenu', blockImageAction, true);
      document.removeEventListener('dragstart', blockImageAction, true);
      style.remove();
    };
  }, []);
  return null;
}
