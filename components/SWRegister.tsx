'use client';
import { useEffect } from 'react';

export function SWRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    let refreshing = false;
    // When a new service worker takes control, reload once so the UI
    // immediately runs the latest code (prevents stale installed apps).
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register('/sw.js')
      .then(reg => {
        console.log('SW registered:', reg.scope);
        reg.update();
      })
      .catch(err => {
        console.error('SW registration failed:', err);
      });
  }, []);

  return null;
}
