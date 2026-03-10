import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { LanguageProvider } from "@/lib/i18n";

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
      <body className="flex flex-col min-h-screen antialiased">
        <LanguageProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </LanguageProvider>
      </body>
    </html>
  );
}
