"use client";

import Link from "next/link";
import {
  ArrowRight,
  Check,
  Zap,
  Globe,
  Target,
  Pencil,
  Send,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { HeroCockpit } from "@/components/hero-cockpit";
import { GoogleIcon } from "@/components/google-button";

// ── Shared primitives ─────────────────────────────────────────────────────────

function SectionNum({ num }: { num: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 32,
          fontWeight: 500,
          color: "var(--text-tertiary)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {num}
      </span>
    </div>
  );
}

function Section({
  num,
  title,
  children,
  alt,
}: {
  num: string;
  title: string;
  children: React.ReactNode;
  alt?: boolean;
}) {
  return (
    <section
      id="product"
      style={{
        padding: "96px 32px",
        borderTop: "1px solid var(--border-subtle)",
        background: alt ? "var(--surface)" : "white",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <SectionNum num={num} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 480px) 1fr",
            gap: 60,
          }}
        >
          <div>
            <h2
              style={{
                fontSize: 44,
                fontWeight: 600,
                lineHeight: 1.1,
                letterSpacing: "-0.025em",
                margin: 0,
                fontFamily: "var(--font-display)",
                color: "var(--text-primary)",
              }}
            >
              {title}
            </h2>
          </div>
          <div>{children}</div>
        </div>
      </div>
    </section>
  );
}

function PrimaryBtn({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "12px 22px",
        fontSize: 15,
        fontWeight: 500,
        background: "var(--accent)",
        color: "white",
        borderRadius: "var(--radius-input)",
        textDecoration: "none",
        transition: "background 0.12s ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
    >
      {children}
    </Link>
  );
}

function SecondaryBtn({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "12px 22px",
        fontSize: 15,
        fontWeight: 500,
        background: "white",
        color: "var(--text-primary)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-input)",
        textDecoration: "none",
        transition: "background 0.12s ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "white"; }}
    >
      {children}
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { t } = useTranslation();
  const l = t.landing;

  const tiers = [
    { lbl: "TIER 0", name: l.tier0Name, desc: l.tier0Desc, kpi: "~40%", color: "#71717A" },
    { lbl: "TIER 1", name: l.tier1Name, desc: l.tier1Desc, kpi: "< 5s", color: "#EF4444" },
    { lbl: "TIER 2", name: l.tier2Name, desc: l.tier2Desc, kpi: "< 60s", color: "#F59E0B" },
    { lbl: "TIER 3", name: l.tier3Name, desc: l.tier3Desc, kpi: "< 1h", color: "#10B981" },
  ];

  const differentiators = [
    { tag: "A", icon: <Zap size={14} color="var(--text-tertiary)" strokeWidth={1.6} />, name: l.diffAName, desc: l.diffADesc },
    { tag: "B", icon: <Globe size={14} color="var(--text-tertiary)" strokeWidth={1.6} />, name: l.diffBName, desc: l.diffBDesc },
    { tag: "C", icon: <Target size={14} color="var(--text-tertiary)" strokeWidth={1.6} />, name: l.diffCName, desc: l.diffCDesc },
  ];

  const stackRows = [
    ["Frontend", "Next.js 15 · React Server Components", l.stackFrontendNote],
    ["Backend", "Hono · Cloudflare Workers", l.stackBackendNote],
    ["DB", "PostgreSQL 16 · pgvector", l.stackDbNote],
    ["LLM", "Anthropic · Ollama (on-prem)", l.stackLlmNote],
    ["Queue", "Cloudflare Queues + Durable Objects", l.stackQueueNote],
    ["Auth", "Better Auth + WorkOS SSO", l.stackAuthNote],
  ];

  return (
    <div style={{ background: "white" }}>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{ padding: "80px 32px 56px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <h1
            style={{
              fontSize: 76,
              lineHeight: 1.04,
              letterSpacing: "-0.035em",
              fontWeight: 600,
              margin: "0 0 22px",
              maxWidth: 1000,
              fontFamily: "var(--font-display)",
              color: "var(--text-primary)",
            }}
          >
            {l.heroTitle1}{" "}
            <span style={{ color: "var(--accent)" }}>{l.heroTitleAccent}</span>.
          </h1>
          <p
            style={{
              fontSize: 19,
              color: "var(--text-secondary)",
              maxWidth: 640,
              lineHeight: 1.55,
              margin: "0 0 28px",
            }}
          >
            {l.heroSubtitle}
          </p>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24 }}>
            <PrimaryBtn href="/wizard">
              {l.heroCta} <ArrowRight size={16} strokeWidth={2} />
            </PrimaryBtn>
            <button
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 14,
                color: "var(--text-secondary)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "12px 4px",
                fontFamily: "inherit",
              }}
            >
              {l.heroCtaSecondary} <ArrowRight size={14} strokeWidth={1.6} />
            </button>
          </div>
          <div
            style={{
              display: "flex",
              gap: 24,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--text-tertiary)",
            }}
          >
            <span>{l.heroTrust1}</span>
            <span>{l.heroTrust2}</span>
            <span>{l.heroTrust3}</span>
          </div>
        </div>
        <div style={{ maxWidth: 1280, margin: "64px auto 0" }}>
          <HeroCockpit />
        </div>
      </section>

      {/* ── 1.0 Connect ──────────────────────────────────────────────────── */}
      <Section num="1.0" title={l.s1Title}>
        <p style={{ fontSize: 16, color: "var(--text-secondary)", lineHeight: 1.65, margin: "0 0 24px" }}>
          {l.s1Body}
        </p>
        <div
          style={{
            background: "var(--surface)",
            borderRadius: 12,
            border: "1px solid var(--border)",
            padding: 16,
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 8,
              border: "1px solid var(--border)",
              padding: 18,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <GoogleIcon size={22} />
              <div style={{ fontSize: 14, fontWeight: 500 }}>{l.s1PermsTitle}</div>
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-tertiary)",
                }}
              >
                kairo.app
              </span>
            </div>
            {[l.s1Perm1, l.s1Perm2, l.s1Perm3].map((perm, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "7px 0",
                  fontSize: 13,
                }}
              >
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    background: i < 2 ? "#10B981" : "var(--surface-2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {i < 2 && <Check size={10} color="white" strokeWidth={3.5} />}
                </div>
                <span>{perm}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            {[
              { label: "Gmail · now", accent: true },
              { label: "Slack · Q3" },
              { label: "WhatsApp · Q3" },
              { label: "Telegram · Q4" },
              { label: "Instagram · Q4" },
            ].map((chip) => (
              <span
                key={chip.label}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  padding: "4px 8px",
                  borderRadius: 4,
                  border: "1px solid var(--border)",
                  background: "white",
                  color: chip.accent ? "var(--accent)" : "var(--text-tertiary)",
                }}
              >
                {chip.label}
              </span>
            ))}
          </div>
        </div>
      </Section>

      {/* ── 2.0 Pipeline ─────────────────────────────────────────────────── */}
      <Section num="2.0" title={l.s2Title} alt>
        <p style={{ fontSize: 16, color: "var(--text-secondary)", lineHeight: 1.65, margin: "0 0 28px" }}>
          {l.s2Body}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {tiers.map((tier) => (
            <div
              key={tier.lbl}
              style={{
                background: "white",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 18,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: "0 0 auto 0",
                  height: 3,
                  background: tier.color,
                }}
              />
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  color: tier.color,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  marginBottom: 10,
                  marginTop: 4,
                }}
              >
                {tier.lbl}
              </div>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                  marginBottom: 6,
                }}
              >
                {tier.name}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                  marginBottom: 14,
                }}
              >
                {tier.desc}
              </div>
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: tier.color,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {tier.kpi}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 3.0 Context ──────────────────────────────────────────────────── */}
      <Section num="3.0" title={l.s3Title}>
        <p style={{ fontSize: 16, color: "var(--text-secondary)", lineHeight: 1.65, margin: "0 0 28px" }}>
          {l.s3Body}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Client panel */}
          <div
            style={{
              background: "white",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {l.s3ClientPanel}
            </span>
            <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "12px 0" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  background: "linear-gradient(135deg,#FCA5A5,#F472B6)",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 600,
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                MP
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Marta Pérez</div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Acme · CFO · Pro</div>
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 1,
                background: "var(--border-subtle)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {[["MRR", "$199"], ["Tickets", "34"], ["CSAT", "4.8"], ["NPS", "+62"]].map(
                ([label, value]) => (
                  <div key={label} style={{ background: "white", padding: 8 }}>
                    <div
                      style={{
                        fontSize: 9,
                        fontFamily: "var(--font-mono)",
                        color: "var(--text-tertiary)",
                        textTransform: "uppercase",
                      }}
                    >
                      {label}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>{value}</div>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Similar cases panel */}
          <div
            style={{
              background: "white",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {l.s3SimilarPanel}
            </span>
            {[
              ["KAI-T-0892", "Cargo duplicado · reembolso", 0.94],
              ["KAI-T-0814", "Doble cobro tras upgrade", 0.91],
              ["KAI-T-0701", "Factura monto erróneo", 0.87],
            ].map(([id, subject, score], i) => (
              <div
                key={String(id)}
                style={{
                  padding: "10px 0",
                  borderBottom: i < 2 ? "1px solid var(--border-subtle)" : "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                  }}
                >
                  <span style={{ color: "var(--text-tertiary)" }}>{String(id)}</span>
                  <span style={{ color: "#10B981" }}>{Number(score).toFixed(2)}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{String(subject)}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── 4.0 Response Flow ────────────────────────────────────────────── */}
      <Section num="4.0" title={l.s4Title} alt>
        <p style={{ fontSize: 16, color: "var(--text-secondary)", lineHeight: 1.65, margin: "0 0 28px" }}>
          {l.s4Body}
        </p>
        <div
          style={{
            background: "white",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: 20,
          }}
        >
          {/* Badge row */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 8px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 500,
                fontFamily: "var(--font-mono)",
                background: "var(--accent-subtle)",
                color: "var(--accent)",
                border: "1px solid #DBE3FF",
              }}
            >
              <Sparkles size={10} color="var(--accent)" />
              {l.s4Badge}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{l.s4BadgeSource}</span>
            <span
              style={{
                marginLeft: "auto",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "#10B981",
              }}
            >
              {l.s4Conf}
            </span>
          </div>

          {/* Draft body */}
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.65,
              color: "var(--text-primary)",
              padding: "12px 0",
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            <p style={{ margin: "0 0 10px" }}>Hola Marta,</p>
            <p style={{ margin: "0 0 10px" }}>
              Confirmamos el cargo duplicado en la orden{" "}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  background: "var(--surface-2)",
                  padding: "1px 5px",
                  borderRadius: 3,
                }}
              >
                #4729
              </span>{" "}
              y ya iniciamos el reembolso al método original.
            </p>
            <p style={{ margin: 0, color: "var(--text-tertiary)" }}>
              Saludos, Valentina · Soporte Kairo
            </p>
          </div>

          {/* Actions */}
          <div
            style={{
              paddingTop: 12,
              borderTop: "1px solid var(--border-subtle)",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <button
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                fontSize: 13,
                fontWeight: 500,
                background: "white",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-input)",
                cursor: "pointer",
                fontFamily: "inherit",
                color: "var(--text-primary)",
              }}
            >
              <Pencil size={12} strokeWidth={1.6} />
              {l.s4Edit}
            </button>
            <button
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                fontSize: 13,
                fontWeight: 500,
                background: "var(--accent)",
                border: "none",
                borderRadius: "var(--radius-input)",
                cursor: "pointer",
                fontFamily: "inherit",
                color: "white",
              }}
            >
              {l.s4Send}
              <Send size={12} strokeWidth={1.6} />
            </button>
            <button
              style={{
                marginLeft: "auto",
                fontSize: 11,
                color: "var(--text-tertiary)",
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <RotateCcw size={11} strokeWidth={1.6} />
              {l.s4Regen}
            </button>
          </div>
        </div>
      </Section>

      {/* ── 5.0 Differentiators ──────────────────────────────────────────── */}
      <Section num="5.0" title={l.s5Title}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 12 }}>
          {differentiators.map((d) => (
            <div
              key={d.tag}
              style={{
                padding: 24,
                border: "1px solid var(--border)",
                borderRadius: 12,
                background: "white",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: "var(--accent-subtle)",
                    color: "var(--accent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {d.tag}
                </div>
                {d.icon}
              </div>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                  marginBottom: 8,
                  color: "var(--text-primary)",
                }}
              >
                {d.name}
              </div>
              <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                {d.desc}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 6.0 Stack ────────────────────────────────────────────────────── */}
      <Section num="6.0" title={l.s6Title} alt>
        <p style={{ fontSize: 16, color: "var(--text-secondary)", lineHeight: 1.65, margin: "0 0 28px" }}>
          {l.s6Body}
        </p>
        <div
          style={{
            background: "white",
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {stackRows.map((row, i) => (
            <div
              key={row[0]}
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr 1fr",
                padding: "14px 18px",
                borderBottom: i < stackRows.length - 1 ? "1px solid var(--border-subtle)" : "none",
                alignItems: "center",
                gap: 16,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {row[0]}
              </span>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{row[1]}</span>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{row[2]}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section
        style={{
          padding: "120px 32px",
          borderTop: "1px solid var(--border-subtle)",
          textAlign: "center",
          background: "white",
        }}
      >
        <h2
          style={{
            fontSize: 60,
            fontWeight: 600,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            margin: "0 auto 18px",
            maxWidth: 720,
            fontFamily: "var(--font-display)",
            color: "var(--text-primary)",
          }}
        >
          {l.ctaTitle}
        </h2>
        <p
          style={{
            fontSize: 17,
            color: "var(--text-secondary)",
            maxWidth: 540,
            margin: "0 auto 28px",
            lineHeight: 1.55,
          }}
        >
          {l.ctaBody}
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <PrimaryBtn href="/wizard">
            {l.ctaPrimary} <ArrowRight size={16} strokeWidth={2} />
          </PrimaryBtn>
          <SecondaryBtn href="/pricing">{l.ctaSecondary}</SecondaryBtn>
        </div>
      </section>
    </div>
  );
}
