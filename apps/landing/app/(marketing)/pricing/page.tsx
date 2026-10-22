"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { Box, Faq, PlanCard, PricingTable, Section, SectionHeader, Segmented } from "@kairo/ui";

interface Plan {
  id: string;
  name: string;
  price: number | null;
  blurb: string;
  cta: string;
  highlight?: boolean;
  features: string[];
}

export default function PricingPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const p = t.pricing;
  const [annual, setAnnual] = useState(true);

  const plans: Plan[] = [
    { id: "free", name: p.plans.free.name, price: 0, blurb: p.plans.free.blurb, cta: p.plans.free.cta, features: p.features.free },
    { id: "pro", name: p.plans.pro.name, price: annual ? 49 : 59, blurb: p.plans.pro.blurb, cta: p.plans.pro.cta, highlight: true, features: p.features.pro },
    { id: "scale", name: p.plans.scale.name, price: annual ? 199 : 249, blurb: p.plans.scale.blurb, cta: p.plans.scale.cta, features: p.features.scale },
    { id: "enterprise", name: p.plans.enterprise.name, price: null, blurb: p.plans.enterprise.blurb, cta: p.plans.enterprise.cta, features: p.features.enterprise },
  ];

  const c = p.table;

  return (
    <>
      <Section first grid>
        <SectionHeader level="h1" title={p.heroTitle} body={p.heroSubtitle} />
        <Segmented
          semantics="group"
          size="lg"
          label={p.billingLabel}
          value={annual ? "annual" : "monthly"}
          onChange={(value) => setAnnual(value === "annual")}
          items={[
            { value: "annual", label: p.billingAnnual },
            { value: "monthly", label: p.billingMonthly },
          ]}
        />
      </Section>

      <Section>
        <Box grid gridTemplateColumns="repeat(4, minmax(0, 1fr))" gap={16}>
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              name={plan.name}
              description={plan.blurb}
              price={plan.price === null ? p.prices.custom : `$${plan.price}`}
              period={plan.price ? `/ ${annual ? p.billedAnnually : p.perMonth}` : undefined}
              recommended={plan.highlight}
              recommendedLabel={plan.highlight ? p.plans.pro.popular : undefined}
              custom={plan.price === null}
              cta={{ label: plan.cta, onPress: () => router.push("/wizard") }}
              features={plan.features}
            />
          ))}
        </Box>
      </Section>

      <Section>
        <Box display="flex" flexDirection="column" gap={40}>
          <SectionHeader eyebrow={c.eyebrow} title={c.title} />
          <PricingTable
            plans={[p.plans.free.name, p.plans.pro.name, p.plans.scale.name, p.plans.enterprise.name]}
            recommended={1}
            groups={c.groups}
            featureLabel={c.feature}
            includedLabel={c.included}
            notIncludedLabel={c.notIncluded}
            caption={c.title}
          />
        </Box>
      </Section>

      <Section surface="sidebar">
        <Box grid gridTemplateColumns="1fr 2fr" gap={60}>
          <SectionHeader title={p.faqTitle} />
          <Faq items={p.faq.map((item: { q: string; a: string }, index: number) => ({ id: String(index), question: item.q, answer: item.a }))} />
        </Box>
      </Section>
    </>
  );
}
