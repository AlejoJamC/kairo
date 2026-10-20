"use client";

import { Box } from "@kairo/ui";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <Box tag="main" flexGrow={1} flexShrink={1} flexBasis="auto">
        {children}
      </Box>
      <Footer />
    </>
  );
}
