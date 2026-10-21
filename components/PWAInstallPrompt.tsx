'use client';
import { useEffect } from 'react';

/** Capture the install prompt once so Settings can offer "Add to Home Screen". */
export function PWAInstallPrompt() {
  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      (window as any).__yyInstallPrompt = event;
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  return null;
}
