import type { Metadata, Viewport } from 'next';
import { SWRegister } from '@/components/SWRegister';
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
  maximumScale: 1,
  userScalable: false,
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
        <ReminderPoller />
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
