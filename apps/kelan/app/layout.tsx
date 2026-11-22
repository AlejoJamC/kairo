import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './reset.css';
import { InstrumentationClient } from './_instrumentation-client';
import { UiRoot } from './ui-root';

export const metadata: Metadata = {
  title: 'Kelan — Kairo Backoffice',
  description: 'Internal platform administration for Kairo.',
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16.png', type: 'image/png', sizes: '16x16' },
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-dark-32.png', type: 'image/png', sizes: '32x32', media: '(prefers-color-scheme: dark)' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <InstrumentationClient />
        <UiRoot>{children}</UiRoot>
      </body>
    </html>
  );
}
