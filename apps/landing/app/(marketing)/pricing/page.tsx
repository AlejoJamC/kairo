"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { Footer } from "@/components/footer";
import { KairoLogo } from "@/components/kairo-logo";

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

function PrimaryButton({
  onClick,
  children,
}: {
  onClick?: () => void;
  href?: string;
  children: React.ReactNode;
}) {
  const className =
    "inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-[6px] cursor-pointer";
  const inner = (
    <span
      className={className}
      style={{
        background: "var(--accent)",
        color: "white",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--accent-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--accent)";
      }}
    >
      {children}
    </span>
  );

  if (onClick) {
    return (
      <button onClick={onClick} style={{ width: "100%", margin: 0 }}>
        {inner}
      </button>
    );
  }

  return <>{inner}</>;
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
  index,
}: {
  plan: Plan;
  annual: boolean;
  index: number;
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
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--text-tertiary)",
          letterSpacing: "0.05em",
          marginBottom: 6,
        }}
      >
        {`0${index + 1}`}
      </div>

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
        <PrimaryButton>{plan.cta}</PrimaryButton>
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
      {/* Header chrome — inline to match prototype */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          height: 64,
          borderBottom: "1px solid var(--border-subtle)",
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            height: "100%",
            padding: "0 32px",
            display: "flex",
            alignItems: "center",
            gap: 32,
          }}
        >
          <KairoLogo size={26} href="/" />

          <nav
            style={{
              display: "flex",
              gap: 24,
              fontSize: 13,
              color: "var(--text-secondary)",
            }}
          >
            {[
              { label: t.header.navProduct, href: "/" },
              { label: t.header.navPricing, href: "/pricing" },
              { label: t.header.navDocs, href: "#" },
              { label: t.header.navChangelog, href: "#" },
            ].map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                style={{
                  color: href === "/pricing" ? "var(--text-primary)" : "var(--text-secondary)",
                  textDecoration: "none",
                  fontWeight: href === "/pricing" ? 500 : 400,
                  transition: "color 0.12s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  if (href !== "/pricing") {
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }
                }}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            {/* Language toggle — inline */}
            <LangToggleInline />

            {/* Auth CTAs — inline */}
            <Link
              href="/login"
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                textDecoration: "none",
              }}
            >
              {t.header.login}
            </Link>
            <Link
              href="/wizard"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: 500,
                background: "var(--accent)",
                color: "white",
                borderRadius: "var(--radius-input)",
                textDecoration: "none",
                transition: "background 0.12s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--accent-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--accent)";
              }}
            >
              {t.header.getStarted}
            </Link>
          </div>
        </div>
      </header>

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
          {plans.map((plan, i) => (
            <PricingCard key={plan.name} plan={plan} annual={annual} index={i} />
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

      {/* Footer — inline to match prototype */}
      <Footer />
    </div>
  );
}

function LangToggleInline() {
  const { locale, setLocale } = useTranslation();

  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        padding: 2,
        border: "1px solid var(--border)",
        borderRadius: 6,
        background: "white",
      }}
    >
      {(["ES", "EN"] as const).map((l) => {
        const active = locale.toUpperCase() === l;
        return (
          <button
            key={l}
            onClick={() => setLocale(l.toLowerCase() as "en" | "es")}
            style={{
              padding: "3px 8px",
              borderRadius: 4,
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              background: active ? "var(--surface-2)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-tertiary)",
              border: "none",
              cursor: "pointer",
              fontWeight: active ? 500 : 400,
            }}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
