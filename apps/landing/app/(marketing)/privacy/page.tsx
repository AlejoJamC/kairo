"use client";

import { useTranslation } from "@/lib/i18n";
import { LegalItem, LegalLink, LegalList, LegalPage, LegalParagraph, LegalSection } from "@/components/legal";
import { Text } from "@kairo/ui";

export default function PrivacyPage() {
  const { t } = useTranslation();
  const p = t.privacy;

  return (
    <LegalPage title={p.title} updated={p.updated} tab="privacy" toc={[{ id: "s1", title: p.s1.title }, { id: "s2", title: p.s2.title }, { id: "s3", title: p.s3.title }, { id: "s4", title: p.s4.title }, { id: "s5", title: p.s5.title }, { id: "s6", title: p.s6.title }, { id: "s7", title: p.s7.title }, { id: "s8", title: p.s8.title }, { id: "s9", title: p.s9.title }]}>
      <LegalSection id="s1" title={p.s1.title}>
        <LegalParagraph>{p.s1.p1}</LegalParagraph>
        <LegalParagraph>{p.s1.p2}</LegalParagraph>
      </LegalSection>

      <LegalSection id="s2" title={p.s2.title}>
        <LegalParagraph>{p.s2.intro}</LegalParagraph>
        <LegalList>
          {p.s2.items.map((item) => (
            <LegalItem key={item.label}>
              <Text tag="strong" fontWeight={600}>{item.label}</Text> {item.text}
            </LegalItem>
          ))}
        </LegalList>
      </LegalSection>

      <LegalSection id="s3" title={p.s3.title} highlight>
        <LegalParagraph>
          <Text tag="strong" fontWeight={600}>{p.s3.importantLabel}</Text> {p.s3.p1}{" "}
          <LegalLink href="https://developers.google.com/terms/api-services-user-data-policy">{p.s3.linkText}</LegalLink>
          {p.s3.p1After}
        </LegalParagraph>
        <LegalList>
          {p.s3.items.map((item, i) => (
            <LegalItem key={i}>
              {item.bold ? (
                <>
                  {item.pre}
                  <Text tag="strong" fontWeight={600}>{item.bold}</Text>
                  {item.post}
                </>
              ) : (
                item.post
              )}
            </LegalItem>
          ))}
        </LegalList>
      </LegalSection>

      <LegalSection id="s4" title={p.s4.title}>
        <LegalParagraph>{p.s4.intro}</LegalParagraph>
        <LegalList>
          {p.s4.items.map((item) => <LegalItem key={item}>{item}</LegalItem>)}
        </LegalList>
      </LegalSection>

      <LegalSection id="s5" title={p.s5.title}>
        <LegalParagraph>{p.s5.intro}</LegalParagraph>
        <LegalList>
          {p.s5.items.map((item) => <LegalItem key={item}>{item}</LegalItem>)}
        </LegalList>
      </LegalSection>

      <LegalSection id="s6" title={p.s6.title}>
        <LegalParagraph>{p.s6.intro}</LegalParagraph>
        <LegalList>
          {p.s6.items.map((item) => <LegalItem key={item}>{item}</LegalItem>)}
        </LegalList>
        <Text tag="p" display="block" marginTop={16} marginHorizontal={0} marginBottom={0} lineHeightRatio={1.65}>
          {p.s6.contactPrefix}{" "}
          <LegalLink href="mailto:get.kairo.ai@gmail.com">get.kairo.ai@gmail.com</LegalLink>
        </Text>
      </LegalSection>

      <LegalSection id="s7" title={p.s7.title}>
        <LegalParagraph>{p.s7.p}</LegalParagraph>
      </LegalSection>

      <LegalSection id="s8" title={p.s8.title}>
        <LegalParagraph>{p.s8.p}</LegalParagraph>
      </LegalSection>

      <LegalSection id="s9" title={p.s9.title}>
        <LegalParagraph>{p.s9.intro}</LegalParagraph>
        <LegalList plain>
          <LegalItem>
            {p.s9.emailLabel}{" "}
            <LegalLink href="mailto:get.kairo.ai@gmail.com">get.kairo.ai@gmail.com</LegalLink>
          </LegalItem>
          <LegalItem>
            {p.s9.websiteLabel}{" "}
            <LegalLink href="https://kairo.alejojamc.com">kairo.alejojamc.com</LegalLink>
          </LegalItem>
        </LegalList>
      </LegalSection>
    </LegalPage>
  );
}
