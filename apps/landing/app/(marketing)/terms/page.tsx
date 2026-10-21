"use client";

import { useTranslation } from "@/lib/i18n";
import { LegalItem, LegalLink, LegalList, LegalPage, LegalParagraph, LegalSection } from "@/components/legal";

export default function TermsPage() {
  const { t } = useTranslation();
  const tr = t.terms;

  return (
    <LegalPage title={tr.title} updated={tr.updated} tab="terms" toc={[{ id: "s1", title: tr.s1.title }, { id: "s2", title: tr.s2.title }, { id: "s3", title: tr.s3.title }, { id: "s4", title: tr.s4.title }, { id: "s5", title: tr.s5.title }, { id: "s6", title: tr.s6.title }, { id: "s7", title: tr.s7.title }, { id: "s8", title: tr.s8.title }, { id: "s9", title: tr.s9.title }, { id: "s10", title: tr.s10.title }, { id: "s11", title: tr.s11.title }]}>
      <LegalSection id="s1" title={tr.s1.title}>
        <LegalParagraph>{tr.s1.p}</LegalParagraph>
      </LegalSection>

      <LegalSection id="s2" title={tr.s2.title}>
        <LegalParagraph>{tr.s2.intro}</LegalParagraph>
        <LegalList>
          {tr.s2.items.map((item) => <LegalItem key={item}>{item}</LegalItem>)}
        </LegalList>
      </LegalSection>

      <LegalSection id="s3" title={tr.s3.title}>
        <LegalParagraph>{tr.s3.intro}</LegalParagraph>
        <LegalList>
          {tr.s3.items.map((item) => <LegalItem key={item}>{item}</LegalItem>)}
        </LegalList>
      </LegalSection>

      <LegalSection id="s4" title={tr.s4.title} highlight>
        <LegalParagraph>{tr.s4.intro}</LegalParagraph>
        <LegalList>
          {tr.s4.items.map((item) => <LegalItem key={item}>{item}</LegalItem>)}
        </LegalList>
      </LegalSection>

      <LegalSection id="s5" title={tr.s5.title}>
        <LegalParagraph>{tr.s5.p}</LegalParagraph>
      </LegalSection>

      <LegalSection id="s6" title={tr.s6.title}>
        <LegalParagraph>{tr.s6.p}</LegalParagraph>
      </LegalSection>

      <LegalSection id="s7" title={tr.s7.title}>
        <LegalParagraph>{tr.s7.intro}</LegalParagraph>
        <LegalList>
          {tr.s7.items.map((item) => <LegalItem key={item}>{item}</LegalItem>)}
        </LegalList>
      </LegalSection>

      <LegalSection id="s8" title={tr.s8.title}>
        <LegalParagraph>{tr.s8.intro}</LegalParagraph>
        <LegalList>
          {tr.s8.items.map((item) => <LegalItem key={item}>{item}</LegalItem>)}
        </LegalList>
      </LegalSection>

      <LegalSection id="s9" title={tr.s9.title}>
        <LegalParagraph>{tr.s9.p}</LegalParagraph>
      </LegalSection>

      <LegalSection id="s10" title={tr.s10.title}>
        <LegalParagraph>{tr.s10.p}</LegalParagraph>
      </LegalSection>

      <LegalSection id="s11" title={tr.s11.title}>
        <LegalParagraph>{tr.s11.intro}</LegalParagraph>
        <LegalList plain>
          <LegalItem>
            {tr.s11.emailLabel}{" "}
            <LegalLink href="mailto:get.kairo.ai@gmail.com">get.kairo.ai@gmail.com</LegalLink>
          </LegalItem>
          <LegalItem>
            {tr.s11.websiteLabel}{" "}
            <LegalLink href="https://kairo.alejojamc.com">kairo.alejojamc.com</LegalLink>
          </LegalItem>
        </LegalList>
      </LegalSection>
    </LegalPage>
  );
}
