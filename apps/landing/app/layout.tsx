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
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-dark-32.png", type: "image/png", sizes: "32x32", media: "(prefers-color-scheme: dark)" },
    ],
    apple: "/apple-touch-icon.png",
  },
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
