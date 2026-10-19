import type { Metadata } from "next";
import "@kairo/tokens/tokens.css";
import "./reset.css";
import { InstrumentationClient } from "./_instrumentation-client";
import { LanguageProvider } from "@/lib/i18n";
import { UiRoot } from "./ui-root";

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
      <body>
        <InstrumentationClient />
        <UiRoot>
          <LanguageProvider>{children}</LanguageProvider>
        </UiRoot>
      </body>
    </html>
  );
}
