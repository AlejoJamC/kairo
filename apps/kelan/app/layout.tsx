import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { InstrumentationClient } from './_instrumentation-client';

export const metadata: Metadata = {
  title: 'Kelan — Kairo Backoffice',
  description: 'Internal platform administration for Kairo.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 antialiased">
        <InstrumentationClient />
        {children}
      </body>
    </html>
  );
}
