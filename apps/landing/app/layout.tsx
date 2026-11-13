import type { Metadata } from "next";
import "@kairo/tokens/tokens.css";
import "./reset.css";
import { InstrumentationClient } from "./_instrumentation-client";
import { LanguageProvider } from "@/lib/i18n";
import { UiRoot } from "./ui-root";

export const metadata: Metadata = {
  title: "Kairo — Responder bien, no responder más",
  description:
    "Kairo ordena el correo de soporte de tu empresa, aprende de tu negocio y te ayuda a responder bien. Empieza con Gmail.",
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
