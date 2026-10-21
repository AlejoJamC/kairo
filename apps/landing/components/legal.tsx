"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Box, Callout, Icon, Section, Segmented, Text } from "@kairo/ui";
import { useTranslation } from "@/lib/i18n";
import { useMinWidth } from "@/lib/hooks/useMinWidth";

type LegalTab = "privacy" | "terms";

interface LegalPageProps {
  title: string;
  updated: string;
  /** Which document this is, for the tabs. */
  tab: LegalTab;
  /** The sections of the page, in order: the table of contents links to them. */
  toc: { id: string; title: string }[];
  /** First block of the article: the summary card or a notice. */
  lead?: ReactNode;
  children: ReactNode;
}

/** The current section of the table of contents: the last one that reached the top of the viewport. */
function useCurrentSection(ids: string[]): string | undefined {
  const [current, setCurrent] = useState<string | undefined>(ids[0]);
  const key = ids.join("|");

  useEffect(() => {
    const sections = key.split("|").map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setCurrent(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [key]);

  return current;
}

/** The frame of a legal page: tabs, title, update date, table of contents and the article. */
export function LegalPage({ title, updated, tab, toc, lead, children }: LegalPageProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const wide = useMinWidth(720);
  const current = useCurrentSection(toc.map((item) => item.id));
  const l = t.legalPage;

  return (
    <Section first>
      <Box marginBottom={24}>
        <Segmented
          label={l.tabsLabel}
          semantics="group"
          value={tab}
          onChange={(value) => router.push(value === "privacy" ? "/privacy" : "/terms")}
          items={[
            { value: "privacy", label: l.tabPrivacy },
            { value: "terms", label: l.tabTerms },
          ]}
        />
      </Box>
      <Box marginBottom={40} display="flex" flexDirection="column">
        <Text tag="h1" display="block" fontSize={54} fontWeight={600} lineHeightRatio={1.05} letterSpacing={-1.84} marginTop={0} marginHorizontal={0} marginBottom={16} color="var(--kairo-color-text)">
          {title}
        </Text>
        <Text tag="p" display="block" margin={0} font="mono" fontSize={11.5} color="var(--kairo-color-faint)">
          {updated} · {l.version}
        </Text>
      </Box>

      <Box display="flex" gap={56} alignItems="flex-start">
        {wide && (
          <Box tag="aside" width={260} flexShrink={0} sticky top={80} display="flex" flexDirection="column" gap={8}>
            <Text tag="div" display="block" paddingHorizontal={10} paddingBottom={4} font="mono" fontSize={10.5} letterSpacing={0.6} textTransform="uppercase" color="var(--kairo-color-faint)">
              {l.tocLabel}
            </Text>
            <Box tag="nav" aria-label={l.tocNav} display="flex" flexDirection="column" gap={2}>
              {toc.map((item) => {
                const active = item.id === current;
                return (
                  <Text
                    key={item.id}
                    tag="a"
                    href={`#${item.id}`}
                    aria-current={active ? "location" : undefined}
                    display="block"
                    paddingVertical={6}
                    paddingHorizontal={10}
                    borderRadius={6}
                    fontSize={13}
                    textDecoration="none"
                    fontWeight={active ? 500 : 400}
                    color={active ? "var(--kairo-color-text)" : "var(--kairo-color-muted)"}
                    backgroundColor={active ? "var(--kairo-color-hover)" : "transparent"}
                  >
                    {item.title}
                  </Text>
                );
              })}
            </Box>
          </Box>
        )}
        <Box tag="article" flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0} maxWidth={720}>
          {lead}
          {children}
        </Box>
      </Box>
    </Section>
  );
}

/** The first block of the terms: they are accepted together with the privacy policy. */
export function LegalNotice() {
  const { t } = useTranslation();
  const l = t.legalPage;
  return (
    <Box marginBottom={44}>
      <Callout icon={<Icon name="info" size={16} />}>
        {l.noticeBefore} <LegalLink href="/privacy">{l.noticeLink}</LegalLink>
        {l.noticeAfter}
      </Callout>
    </Box>
  );
}

/** What the document says in a few lines, first in the article. */
export function LegalSummary() {
  const { t } = useTranslation();
  const l = t.legalPage;
  return (
    <Box id="summary" marginBottom={44} padding={24} borderRadius={14} borderWidth={1} borderStyle="solid" borderColor="var(--kairo-color-line)" backgroundColor="var(--kairo-color-side)" display="flex" flexDirection="column" gap={14}>
      <Text tag="div" display="block" font="mono" fontSize={10.5} letterSpacing={0.6} color="var(--kairo-color-faint)">
        {l.summaryTitle}
      </Text>
      <Box tag="ul" margin={0} padding={0} listStyle="none" display="flex" flexDirection="column" gap={10}>
        {l.summaryPoints.map((point) => (
          <Box key={point} tag="li" display="flex" gap={10} alignItems="flex-start">
            <Icon name="check" size={16} color="var(--kairo-color-ok)" />
            <Text fontSize={14.5} color="var(--kairo-color-text)">
              {point}
            </Text>
          </Box>
        ))}
      </Box>
      <Text tag="p" display="block" margin={0} font="mono" fontSize={11} color="var(--kairo-color-faint)">
        {l.summaryNote}
      </Text>
    </Box>
  );
}

/** A titled block of a legal page; the highlighted one is shown as a notice. */
export function LegalSection({ id, title, highlight, children }: { id: string; title: string; highlight?: boolean; children: ReactNode }) {
  const content = (
    <>
      <Text tag="h2" display="block" fontSize={20} fontWeight={600} marginTop={0} marginHorizontal={0} marginBottom={16} color="var(--kairo-color-text)">
        {title}
      </Text>
      {children}
    </>
  );
  return (
    <Box tag="section" id={id} marginBottom={44}>
      {highlight ? <Callout tone="ai">{content}</Callout> : content}
    </Box>
  );
}

export function LegalParagraph({ children }: { children: ReactNode }) {
  return (
    <Text tag="p" display="block" marginTop={0} marginHorizontal={0} marginBottom={16} fontSize={15} lineHeightRatio={1.7} color="var(--kairo-color-muted)">
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
    <Text tag="li" display={"list-item" as never} fontSize={15} lineHeightRatio={1.7} color="var(--kairo-color-muted)">
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
