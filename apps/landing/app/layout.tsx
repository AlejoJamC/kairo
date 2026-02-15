import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kairo — AI Support Cockpit",
  description:
    "Resolve support tickets in seconds. AI-powered triage, intelligent prioritization, and rapid response times.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
