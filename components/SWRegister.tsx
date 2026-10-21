'use client';
import { useEffect } from 'react';

export function SWRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    let prompted = false;

    function promptUpdate() {
      if (prompted || !navigator.serviceWorker.controller) return;
      prompted = true;
      if (window.confirm('元婴有新版本了，现在刷新以获取最新化形？')) {
        window.location.reload();
      }
    }

    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then(reg => {
        console.log('SW registered:', reg.scope);
        if (reg.waiting) promptUpdate();

        reg.onupdatefound = () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.onstatechange = () => {
            if (worker.state === 'installed') promptUpdate();
          };
        };

        reg.update().catch(() => {});
      })
      .catch(err => {
        console.error('SW registration failed:', err);
      });

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.serviceWorker
        .getRegistration()
        .then(reg => reg?.update())
        .catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  return null;
}
