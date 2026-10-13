'use client';
import { useEffect } from 'react';

export function SWRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js')
      .then(reg => {
        console.log('SW registered:', reg.scope);
      })
      .catch(err => {
        console.error('SW registration failed:', err);
      });
  }, []);

  return null;
}
