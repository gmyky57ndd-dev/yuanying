import type { Metadata, Viewport } from 'next';
import { SWRegister } from '@/components/SWRegister';
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt';
import { ReminderPoller } from '@/components/ReminderPoller';
import { AuthGate } from '@/components/AuthGate';
import './globals.css';

export const metadata: Metadata = {
  title: '元婴',
  description: 'Not a chatbot. Not an assistant. Your second self.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '元婴',
  },
  icons: {
    icon: '/avatar.png',
    apple: '/avatar.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0c0a09',
  width: 'device-width',
  initialScale: 1,
  // ES-056: do NOT lock scaling. `maximum-scale=1` + `user-scalable=no` is an
  // accessibility failure, and on several Android builds the IME refuses to
  // open for a non-zoomable page. Do NOT set `interactive-widget=resizes-content`
  // either: the Gboard 更改键盘 popup resizes the visual viewport, and a layout
  // reflow at that moment dismisses the popup.
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="bg-stone-950 text-stone-100 antialiased">
        <SWRegister />
        <PWAInstallPrompt />
        <ReminderPoller />
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
