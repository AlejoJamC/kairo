import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './reset.css';
import { InstrumentationClient } from './_instrumentation-client';
import { UiRoot } from './ui-root';

export const metadata: Metadata = {
  title: 'Kelan — Kairo Backoffice',
  description: 'Internal platform administration for Kairo.',
  robots: { index: false, follow: false },
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
