import type { ReactNode } from 'react';

// The desktop shell is auth-dependent: never let a stale prerendered HTML
// reference a chunk from an older build (blank page after a rebuild).
export const dynamic = 'force-dynamic';

export default function DesktopLayout({ children }: { children: ReactNode }) {
  return children;
}
