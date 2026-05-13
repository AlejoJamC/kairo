"use client";

import { useState } from "react";
import { useTranslation } from "@/lib/i18n";

function CheckIcon() {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--success)"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, marginTop: 2 }}
    />
  );
}

function AccentCheckIcon() {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--accent)"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, marginTop: 2 }}
    />
  );
}

function BillingToggle({
  annual,
  setAnnual,
}: {
  annual: boolean;
  setAnnual: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const p = t.pricing;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: 4,
        border: "1px solid var(--border)",
        borderRadius: 999,
        background: "var(--surface)",
      }}
    >
      {(
        [
          [true, p.billingAnnual],
          [false, p.billingMonthly],
        ] as const
      ).map(([v, label]) => {
        const active = annual === v;
        return (
          <button
            key={String(v)}
            onClick={() => setAnnual(v)}
            style={{
              padding: "6px 16px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: active ? 500 : 400,
              background: active ? "white" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-tertiary)",
              boxShadow: active ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.12s ease",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function CTAButton({
  kind,
  children,
}: {
  kind: "primary" | "secondary";
  children: React.ReactNode;
}) {
  if (kind === "primary") {
    return (
      <button
        style={{
          width: "100%",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "12px 16px",
          fontSize: 14,
          fontWeight: 500,
          background: "var(--accent)",
          color: "white",
          borderRadius: "var(--radius-input)",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          transition: "background 0.12s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--accent-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--accent)";
        }}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      style={{
        width: "100%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "12px 16px",
        fontSize: 14,
        fontWeight: 500,
        background: "white",
        color: "var(--text-primary)",
        borderRadius: "var(--radius-input)",
        border: "1px solid var(--border)",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "background 0.12s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--surface-2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "white";
      }}
    >
      {children}
    </button>
  );
}

interface Plan {
  name: string;
  price: number | null;
  blurb: string;
  cta: string;
  highlight?: boolean;
  features: string[];
}

function PricingCard({
  plan,
  annual,
}: {
  plan: Plan;
  annual: boolean;
}) {
  const { t } = useTranslation();
  const p = t.pricing;

  const periodText = annual ? p.billedAnnually : p.perMonth;

  return (
    <div
      style={{
        padding: 24,
        borderRadius: 14,
        border: plan.highlight ? "1.5px solid var(--accent)" : "1px solid var(--border)",
        background: plan.highlight
          ? "linear-gradient(180deg, #F7F9FF 0%, white 100%)"
          : "white",
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {plan.highlight && (
        <span
          style={{
            position: "absolute",
            top: -10,
            left: 24,
            background: "var(--accent)",
            color: "white",
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            padding: "3px 8px",
            borderRadius: 4,
            letterSpacing: "0.04em",
          }}
        >
          {p.plans.pro.popular}
        </span>
      )}

      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          marginBottom: 8,
          fontFamily: "var(--font-display)",
        }}
      >
        {plan.name}
      </div>

      <div
        style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          minHeight: 56,
          marginBottom: 16,
          lineHeight: 1.5,
        }}
      >
        {plan.blurb}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 4,
          marginBottom: 18,
          paddingBottom: 18,
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        {plan.price === null ? (
          <span
            style={{
              fontSize: 28,
              fontWeight: 600,
              fontFamily: "var(--font-display)",
            }}
          >
            {p.prices.custom}
          </span>
        ) : plan.price === 0 ? (
          <span
            style={{
              fontSize: 36,
              fontWeight: 600,
              fontFamily: "var(--font-display)",
            }}
          >
            $0
          </span>
        ) : (
          <>
            <span
              style={{
                fontSize: 36,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                fontFamily: "var(--font-display)",
              }}
            >
              ${plan.price}
            </span>
            <span
              style={{
                fontSize: 13,
                color: "var(--text-tertiary)",
              }}
            >
              / {periodText}
            </span>
          </>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <CTAButton kind={plan.highlight ? "primary" : "secondary"}>{plan.cta}</CTAButton>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {plan.features.map((feature) => (
          <div
            key={feature}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              fontSize: 13,
              color: "var(--text-secondary)",
            }}
          >
            {plan.highlight ? <AccentCheckIcon /> : <CheckIcon />}
            <span>{feature}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FAQItem({ question, answer, isLast }: { question: string; answer: string; isLast?: boolean }) {
  return (
    <details
      style={{
        borderTop: "1px solid var(--border)",
        borderBottom: isLast ? "1px solid var(--border)" : "none",
        padding: "16px 0",
      }}
    >
      <summary
        style={{
          fontSize: 15,
          fontWeight: 500,
          cursor: "pointer",
          listStyle: "none",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {question}
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-tertiary)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </summary>
      <div
        style={{
          marginTop: 10,
          fontSize: 14,
          color: "var(--text-secondary)",
          lineHeight: 1.6,
        }}
      >
        {answer}
      </div>
    </details>
  );
}

export default function PricingPage() {
  const { t } = useTranslation();
  const p = t.pricing;
  const [annual, setAnnual] = useState(true);

  const plans: Plan[] = [
    {
      name: p.plans.free.name,
      price: 0,
      blurb: p.plans.free.blurb,
      cta: p.plans.free.cta,
      features: p.features.free,
    },
    {
      name: p.plans.pro.name,
      price: annual ? 49 : 59,
      blurb: p.plans.pro.blurb,
      cta: p.plans.pro.cta,
      highlight: true,
      features: p.features.pro,
    },
    {
      name: p.plans.scale.name,
      price: annual ? 199 : 249,
      blurb: p.plans.scale.blurb,
      cta: p.plans.scale.cta,
      features: p.features.scale,
    },
    {
      name: p.plans.enterprise.name,
      price: null,
      blurb: p.plans.enterprise.blurb,
      cta: p.plans.enterprise.cta,
      features: p.features.enterprise,
    },
  ];

  return (
    <div style={{ background: "white" }}>
      {/* Hero section */}
      <section
        style={{
          padding: "64px 32px 40px",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 540, margin: "0 auto" }}>
          <h1
            style={{
              fontSize: 56,
              fontWeight: 600,
              letterSpacing: "-0.03em",
              margin: "14px 0 16px",
              fontFamily: "var(--font-display)",
              lineHeight: 1.05,
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
            }}
          >
            {p.heroTitle}
          </h1>
          <p
            style={{
              fontSize: 17,
              color: "var(--text-secondary)",
              maxWidth: 540,
              margin: "0 auto 28px",
              lineHeight: 1.55,
            }}
          >
            {p.heroSubtitle}
          </p>
        </div>
        <BillingToggle annual={annual} setAnnual={setAnnual} />
      </section>

      {/* Pricing cards */}
      <section style={{ padding: "0 32px 80px" }}>
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
          }}
        >
          {plans.map((plan) => (
            <PricingCard key={plan.name} plan={plan} annual={annual} />
          ))}
        </div>
      </section>

      {/* FAQ section */}
      <section
        style={{
          padding: "60px 32px",
          borderTop: "1px solid var(--border-subtle)",
          background: "var(--surface)",
        }}
      >
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 2fr",
              gap: 60,
              marginTop: 24,
            }}
          >
            <h2
              style={{
                fontSize: 36,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                margin: 0,
                fontFamily: "var(--font-display)",
                lineHeight: 1.15,
                color: "var(--text-primary)",
              }}
            >
              {p.faqTitle}
            </h2>
            <div>
              {p.faq.map((item: { q: string; a: string }, i: number) => (
                <FAQItem
                  key={i}
                  question={item.q}
                  answer={item.a}
                  isLast={i === p.faq.length - 1}
                />
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
