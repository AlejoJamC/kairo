"use client";

import type { ReactNode } from "react";
import { Box, Callout, Section, Text } from "@kairo/ui";

/** The frame of a legal page: a narrow section with the title and the update date. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <Section first narrow>
      <Box marginBottom={40}>
        <Text tag="h1" display="block" fontSize={40} fontWeight={600} letterSpacing={-1} marginTop={0} marginHorizontal={0} marginBottom={12} color="var(--kairo-color-text)">
          {title}
        </Text>
        <Text tag="p" display="block" margin={0} color="var(--kairo-color-muted)">
          {updated}
        </Text>
      </Box>
      {children}
    </Section>
  );
}

/** A titled block of a legal page; the highlighted one is shown as a notice. */
export function LegalSection({ title, highlight, children }: { title: string; highlight?: boolean; children: ReactNode }) {
  const content = (
    <>
      <Text tag="h2" display="block" fontSize={24} fontWeight={600} marginTop={0} marginHorizontal={0} marginBottom={16} color="var(--kairo-color-text)">
        {title}
      </Text>
      {children}
    </>
  );
  return (
    <Box tag="section" marginBottom={32}>
      {highlight ? <Callout tone="ai">{content}</Callout> : content}
    </Box>
  );
}

export function LegalParagraph({ children }: { children: ReactNode }) {
  return (
    <Text tag="p" display="block" marginTop={0} marginHorizontal={0} marginBottom={16} lineHeightRatio={1.65} color="var(--kairo-color-text)">
      {children}
    </Text>
  );
}

export function LegalList({ children, plain }: { children: ReactNode; plain?: boolean }) {
  return (
    <Box tag="ul" margin={0} paddingLeft={plain ? 0 : 24} listStyle={plain ? "none" : "disc"} display="flex" flexDirection="column" gap={8}>
      {children}
    </Box>
  );
}

export function LegalItem({ children }: { children: ReactNode }) {
  return (
    <Text tag="li" display={"list-item" as never} lineHeightRatio={1.6} color="var(--kairo-color-text)">
      {children}
    </Text>
  );
}

export function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith("http");
  return (
    <Text tag="a" href={href} color="var(--kairo-color-accent)" textDecoration="none" {...(external ? { target: "_blank" as const, rel: "noopener noreferrer" } : {})}>
      {children}
    </Text>
  );
}
