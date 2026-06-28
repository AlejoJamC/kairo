import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Sparkles, Check, ChevronRight, ChevronDown, Copy, Plus, BookOpen,
  Ticket as TicketIcon, User, ArrowUp, Square, AtSign,
  Activity, PenLine, Layers, type LucideIcon,
} from "lucide-react";
import { useTriageStore } from "@/stores/triage-store";

// ============================================================================
// AssistantPanel — "Assistant" tab: agent chat copilot (KAI-249)
//
// Faithful port of the design reference (read-only):
//   packages/claude_design/assistant v0.1/{assistant.jsx, assistant-panel.jsx}
//
// Conversational copilot living in the Triage right panel: reasoning stepper,
// answer streamed char-by-char with a blinking caret, draft card, source
// citations and follow-up chips. The "Insert in reply" action pushes the draft
// into the composer via the existing `setSuggestedReply` store plumbing
// (consumed by reply-bar.tsx) — no new wiring.
//
// STUB: the scripted answers below stand in for real model output. Backend
// issue KAI-250 replaces `resolveAnswer` with a call to
// POST /api/v1/tickets/:id/assistant/draft (streamed) — the rendering layer
// (stepper / streaming / draft card / citations) stays as-is.
// ============================================================================

// ── Types ───────────────────────────────────────────────────────────────────
interface Step { label: string; detail: string }
type ProseBlock = { type: "p"; text: string } | { type: "bullets"; items: string[] };
interface Citation { kind: "kb" | "ticket"; id: string; title: string; meta: string }
interface Draft { subject: string; body: string }
interface Answer {
  steps:      Step[];
  prose:      ProseBlock[];
  quote?:     { text: string; source: string };
  draft?:     Draft;
  citations?: Citation[];
  followups?: string[];
}
type Turn =
  | { id: number; role: "u"; text: string }
  | { id: number; role: "a"; answer: Answer };

// ── Starters (suggestion chips) — labels are i18n, answers are scripted ───────
type StarterKey =
  | "ai.assistantStarterResume"
  | "ai.assistantStarterPolicy"
  | "ai.assistantStarterDraft"
  | "ai.assistantStarterSimilar";
const STARTERS: { id: string; icon: LucideIcon; labelKey: StarterKey }[] = [
  { id: "resume",  icon: Activity, labelKey: "ai.assistantStarterResume"  },
  { id: "policy",  icon: BookOpen, labelKey: "ai.assistantStarterPolicy"  },
  { id: "draft",   icon: PenLine,  labelKey: "ai.assistantStarterDraft"   },
  { id: "similar", icon: Layers,   labelKey: "ai.assistantStarterSimilar" },
];

// ── STUB scripted answers (replaced by KAI-250) ──────────────────────────────
// Demo content that mimics what the model returns. Spanish placeholder copy —
// not localized because it is throwaway seed data, not UI chrome.
const ANSWERS: Record<string, Answer> = {
  resume: {
    steps: [
      { label: "Leyendo hilo del ticket",            detail: "3 mensajes" },
      { label: "Analizando sentimiento",             detail: "tono + urgencia" },
      { label: "Cruzando con historial de cliente",  detail: "34 tickets" },
    ],
    prose: [
      { type: "p", text: "El cliente reporta un **cobro duplicado de $199** en la orden `#4729`: el primer cargo ya fue acreditado, pero el segundo nunca se reversó." },
      { type: "bullets", items: [
        "**Sentimiento:** urgente pero cordial — tiene cierre contable mañana.",
        "**Riesgo:** medio-alto. Cliente Pro con CSAT 4.8; un mal manejo afecta renovación.",
        "**Acción sugerida:** confirmar el duplicado y ofrecer reembolso al método original o crédito al próximo ciclo.",
      ] },
    ],
    citations: [
      { kind: "ticket", id: "KAI-T-1247", title: "Cobro duplicado en factura de noviembre", meta: "hilo actual" },
      { kind: "ticket", id: "Acme · CRM", title: "Cuenta Pro · $199 MRR · cliente desde mar 2024", meta: "CSAT 4.8" },
    ],
    followups: ["Redacta una respuesta de reembolso", "¿Cuánto tarda el reverso en Stripe?"],
  },
  policy: {
    steps: [
      { label: "Buscando en base de conocimiento", detail: "47 artículos" },
      { label: "Filtrando por relevancia",         detail: "umbral ≥ 0.80" },
    ],
    prose: [
      { type: "p", text: "Según la política vigente, un **cobro duplicado** confirmado se resuelve así:" },
      { type: "bullets", items: [
        "Verificar el doble cargo en Stripe con el mismo `order_id` y monto.",
        "Reembolsar al método original (3–5 días hábiles) **o** emitir crédito al siguiente ciclo, a elección del cliente.",
        "Para clientes Pro/Scale, no se requiere aprobación de manager bajo $500.",
      ] },
    ],
    quote: {
      source: "KB · Política de doble cobro y reversos",
      text: "Todo reverso por error de facturación debe procesarse el mismo día hábil. El cliente elige reembolso o crédito; ambos quedan registrados en la nota de la cuenta.",
    },
    citations: [
      { kind: "kb", id: "KB-014", title: "Política de doble cobro y reversos", meta: "conf 0.96" },
      { kind: "kb", id: "KB-007", title: "Cómo procesar un reembolso vía Stripe", meta: "conf 0.89" },
    ],
    followups: ["Redacta la respuesta aplicando esta política", "Muéstrame el paso a paso en Stripe"],
  },
  draft: {
    steps: [
      { label: "Recuperando 5 casos similares", detail: "pgvector ≥ 0.84" },
      { label: "Aplicando política KB-014",     detail: "reembolso / crédito" },
      { label: "Redactando en tono de marca",   detail: "cordial · resolutivo" },
    ],
    prose: [
      { type: "p", text: "Listo. Redacté una respuesta basada en 5 casos resueltos y la política de reversos. Puedes insertarla directo en el editor:" },
    ],
    draft: {
      subject: "Re: Cobro duplicado en factura de noviembre",
      body: `Hola,

Confirmamos el cargo duplicado de $199 en la orden #4729 y ya iniciamos el reembolso al método original. Verás el reverso reflejado en 3–5 días hábiles según tu banco.

Si prefieres aplicarlo como crédito a tu próximo ciclo en lugar del reembolso, respóndenos y lo ajustamos de inmediato — a tiempo para tu cierre contable.

Lamentamos el inconveniente.

Saludos,
Soporte Kairo`,
    },
    citations: [
      { kind: "ticket", id: "KAI-T-0892", title: "Cargo duplicado en factura mensual", meta: "0.94 sim" },
      { kind: "kb",     id: "KB-014",      title: "Política de doble cobro y reversos", meta: "conf 0.96" },
    ],
    followups: ["Hazla más breve", "Ofrece solo crédito, no reembolso"],
  },
  similar: {
    steps: [
      { label: "Embebiendo el ticket actual",          detail: "kairo-embed-3" },
      { label: "Buscando en 1,204 tickets resueltos",  detail: "pgvector" },
    ],
    prose: [
      { type: "p", text: "Encontré **3 casos muy parecidos**, todos resueltos sin escalar:" },
      { type: "bullets", items: [
        "`KAI-T-0892` — reembolso al método original en 4 días. CSAT 5.0.",
        "`KAI-T-0814` — crédito aplicado al siguiente ciclo + confirmación.",
        "`KAI-T-0701` — nota de crédito + ajuste manual en Stripe.",
      ] },
    ],
    citations: [
      { kind: "ticket", id: "KAI-T-0892", title: "Cargo duplicado en factura mensual", meta: "0.94 sim" },
      { kind: "ticket", id: "KAI-T-0814", title: "Doble cobro tras upgrade de plan",   meta: "0.91 sim" },
      { kind: "ticket", id: "KAI-T-0701", title: "Factura con monto erróneo",          meta: "0.87 sim" },
    ],
    followups: ["¿Qué resolución funcionó mejor?", "Redacta la respuesta como el caso 0892"],
  },
};

const FALLBACK: Answer = {
  steps: [
    { label: "Buscando contexto del ticket",    detail: "hilo activo" },
    { label: "Consultando base de conocimiento", detail: "47 artículos" },
  ],
  prose: [
    { type: "p", text: "Con el contexto de este ticket puedo **resumir el caso**, **redactar una respuesta**, **buscar casos similares** o **citar la política aplicable** — dime qué necesitas." },
  ],
  followups: ["Resume este ticket", "Redacta una respuesta de reembolso"],
};

// STUB: KAI-250 replaces this with the backend call.
function resolveAnswer(text: string, starterId?: string): Answer {
  if (starterId && ANSWERS[starterId]) return ANSWERS[starterId];
  const t = text.toLowerCase();
  if (/(resum|sentimiento|qué pasa|de qué)/.test(t)) return ANSWERS.resume;
  if (/(pol[íi]tica|reembolso.*pol|doble cobro|duplicad.*pol)/.test(t)) return ANSWERS.policy;
  if (/(redact|respond|respuesta|borrador|escrib|draft|breve|cr[ée]dito)/.test(t)) return ANSWERS.draft;
  if (/(similar|parecid|otros casos|antes)/.test(t)) return ANSWERS.similar;
  return FALLBACK;
}

// ── Inline markdown: **bold** and `code` ─────────────────────────────────────
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      out.push(<strong key={k++} style={{ fontWeight: 600, color: "var(--k-text-primary)" }}>{tok.slice(2, -2)}</strong>);
    } else {
      out.push(<code key={k++} style={{ fontFamily: "var(--k-font-mono)", fontSize: 12, background: "var(--k-surface-2)", padding: "1px 5px", borderRadius: 4, color: "var(--k-text-primary)" }}>{tok.slice(1, -1)}</code>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// ── Atoms ────────────────────────────────────────────────────────────────────
function AssistantMark({ size = 24 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 7, flexShrink: 0,
      background: "var(--k-gradient-ai)",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "0 0 0 1px rgba(43,91,255,0.18), 0 4px 12px rgba(43,91,255,0.28)",
    }}>
      <Sparkles style={{ width: size * 0.56, height: size * 0.56, color: "white" }} />
    </div>
  );
}

function Caret() {
  return <span className="kai-caret" style={{ display: "inline-block", width: 7, height: 14, marginLeft: 1, marginBottom: -2, background: "var(--k-accent)", borderRadius: 1 }} />;
}

// ── Reasoning stepper ────────────────────────────────────────────────────────
function Steps({ steps, phase }: { steps: Step[]; phase: Phase }) {
  const { t } = useTranslation("dashboard");
  const [open, setOpen] = useState(true);
  const done = phase !== "thinking";
  useEffect(() => { if (done) setOpen(false); }, [done]);
  return (
    <div style={{ marginBottom: 10 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)", padding: "2px 0", background: "none", border: "none", cursor: "pointer" }}
      >
        {!done
          ? <span className="kai-spin" style={{ width: 11, height: 11, borderRadius: 999, border: "1.6px solid var(--k-border)", borderTopColor: "var(--k-accent)", display: "inline-block" }} />
          : <Check style={{ width: 12, height: 12, color: "var(--k-success)" }} />}
        <span>{done ? t("ai.assistantReasoned", { count: steps.length }) : t("ai.assistantThinking")}</span>
        <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", display: "inline-flex" }}>
          <ChevronRight style={{ width: 11, height: 11, color: "var(--k-text-tertiary)" }} />
        </span>
      </button>
      {open && (
        <div style={{ marginTop: 6, marginLeft: 5, paddingLeft: 12, borderLeft: "1px solid var(--k-border-subtle)", display: "flex", flexDirection: "column", gap: 7 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--k-success)", flexShrink: 0 }} />
              <span style={{ color: "var(--k-text-secondary)" }}>{s.label}</span>
              <span style={{ fontFamily: "var(--k-font-mono)", fontSize: 10.5, color: "var(--k-text-tertiary)" }}>{s.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CitationCard({ c }: { c: Citation }) {
  return (
    <button
      type="button"
      style={{ display: "flex", alignItems: "flex-start", gap: 9, width: "100%", textAlign: "left", padding: "8px 10px", border: "1px solid var(--k-border)", borderRadius: 8, background: "white", cursor: "pointer", transition: "all .12s" }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--k-accent-border)"; e.currentTarget.style.background = "var(--k-accent-faint)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--k-border)"; e.currentTarget.style.background = "white"; }}
    >
      <div style={{ width: 22, height: 22, borderRadius: 5, flexShrink: 0, marginTop: 1, background: c.kind === "kb" ? "var(--k-accent-subtle)" : "var(--k-surface-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {c.kind === "kb"
          ? <BookOpen style={{ width: 12, height: 12, color: "var(--k-accent)" }} />
          : <TicketIcon style={{ width: 12, height: 12, color: "var(--k-text-secondary)" }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "var(--k-font-mono)", fontSize: 10.5, color: "var(--k-text-tertiary)" }}>{c.id}</span>
          <span style={{ marginLeft: "auto", fontFamily: "var(--k-font-mono)", fontSize: 10, color: c.kind === "kb" ? "var(--k-accent)" : "var(--k-success)" }}>{c.meta}</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--k-text-primary)", lineHeight: 1.35, marginTop: 1 }}>{c.title}</div>
      </div>
    </button>
  );
}

function DraftCard({ d, onInsert, inserted }: { d: Draft; onInsert: () => void; inserted: boolean }) {
  const { t } = useTranslation("dashboard");
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ border: "1px solid var(--k-border)", borderRadius: 10, overflow: "hidden", position: "relative" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: "var(--k-gradient-ai)" }} />
      <div style={{ padding: "8px 11px", borderBottom: "1px solid var(--k-border-subtle)", display: "flex", alignItems: "center", gap: 7, background: "var(--k-surface)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, fontFamily: "var(--k-font-mono)", letterSpacing: "0.02em", padding: "2px 7px", borderRadius: 999, background: "var(--k-accent-subtle)", color: "var(--k-accent)", border: "1px solid var(--k-accent-border)" }}>
          <Sparkles style={{ width: 9, height: 9 }} /> {t("ai.assistantDraftBadge")}
        </span>
        <span style={{ fontSize: 11, color: "var(--k-text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.subject}</span>
      </div>
      <div style={{ padding: "11px 13px", fontSize: 12.5, lineHeight: 1.6, color: "var(--k-text-primary)", whiteSpace: "pre-wrap", maxHeight: 168, overflowY: "auto" }}>{d.body}</div>
      <div style={{ padding: "8px 10px", borderTop: "1px solid var(--k-border-subtle)", display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={() => { navigator.clipboard?.writeText(d.body).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1400); }}
          style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, padding: "5px 9px", border: "1px solid var(--k-border)", borderRadius: 6, color: copied ? "var(--k-success)" : "var(--k-text-secondary)", background: "white", cursor: "pointer" }}
        >
          {copied ? <Check style={{ width: 12, height: 12 }} /> : <Copy style={{ width: 12, height: 12 }} />}
          {copied ? t("ai.assistantCopied") : t("ai.assistantCopy")}
        </button>
        <button
          type="button"
          onClick={onInsert}
          disabled={inserted}
          style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, padding: "5px 11px", borderRadius: 6, color: "white", background: inserted ? "var(--k-success)" : "var(--k-accent)", fontWeight: 500, border: "none", cursor: inserted ? "default" : "pointer" }}
        >
          {inserted ? <Check style={{ width: 12, height: 12 }} /> : <Plus style={{ width: 12, height: 12 }} />}
          {inserted ? t("ai.assistantInserted") : t("ai.assistantInsert")}
        </button>
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}>
      <div style={{ maxWidth: "85%", padding: "8px 12px", borderRadius: "12px 12px 4px 12px", background: "var(--k-surface-2)", color: "var(--k-text-primary)", fontSize: 13.5, lineHeight: 1.5 }}>{text}</div>
    </div>
  );
}

// ── Assistant turn — owns its own streaming lifecycle ────────────────────────
type Phase = "thinking" | "streaming" | "done";

function AssistantTurn({ answer, onInsert, onFollowup }: {
  answer: Answer;
  onInsert: () => void;
  onFollowup: (f: string) => void;
}) {
  const { t } = useTranslation("dashboard");
  const [phase, setPhase]   = useState<Phase>("thinking");
  const [proseN, setProseN] = useState(0);
  const [charN, setCharN]   = useState(0);
  const [inserted, setInserted] = useState(false);

  // thinking → streaming
  useEffect(() => {
    let alive = true;
    const thinkMs = 420 * answer.steps.length + 360;
    const id = setTimeout(() => { if (alive) setPhase("streaming"); }, thinkMs);
    return () => { alive = false; clearTimeout(id); };
  }, [answer.steps.length]);

  // stream prose block by block, char by char
  useEffect(() => {
    if (phase !== "streaming") return;
    if (proseN >= answer.prose.length) { setPhase("done"); return; }
    const block = answer.prose[proseN];
    const full = block.type === "bullets" ? block.items.join("\n") : block.text;
    if (charN < full.length) {
      const step = block.type === "bullets" ? 9 : 7;
      const id = setTimeout(() => setCharN((n) => Math.min(full.length, n + step)), 16);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => { setProseN((n) => n + 1); setCharN(0); }, 90);
    return () => clearTimeout(id);
  }, [phase, proseN, charN, answer.prose]);

  const visibleBlocks = answer.prose.slice(0, proseN + (phase === "streaming" ? 1 : 0));
  const done = phase === "done";

  return (
    <div style={{ display: "flex", gap: 9, marginBottom: 20 }}>
      <AssistantMark size={24} />
      <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
        <Steps steps={answer.steps} phase={phase} />

        {visibleBlocks.map((b, i) => {
          const streaming = phase === "streaming" && i === proseN;
          if (b.type === "p") {
            const txt = streaming ? b.text.slice(0, charN) : b.text;
            return <p key={i} style={{ margin: "0 0 9px", fontSize: 13.5, lineHeight: 1.6, color: "var(--k-text-secondary)" }}>{renderInline(txt)}{streaming && <Caret />}</p>;
          }
          const joined = b.items.join("\n");
          const shown = streaming ? joined.slice(0, charN).split("\n") : b.items;
          return (
            <ul key={i} style={{ margin: "0 0 9px", paddingLeft: 2, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
              {shown.map((it, j) => it !== "" && (
                <li key={j} style={{ display: "flex", gap: 8, fontSize: 13, lineHeight: 1.55, color: "var(--k-text-secondary)" }}>
                  <span style={{ marginTop: 7, width: 4, height: 4, borderRadius: 999, background: "var(--k-accent)", flexShrink: 0 }} />
                  <span>{renderInline(it)}{streaming && j === shown.length - 1 && <Caret />}</span>
                </li>
              ))}
            </ul>
          );
        })}

        {done && answer.quote && (
          <div style={{ margin: "0 0 11px", padding: "10px 12px", background: "var(--k-surface)", borderLeft: "2px solid var(--k-accent)", borderRadius: "0 8px 8px 0" }}>
            <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--k-text-primary)", fontStyle: "italic" }}>“{answer.quote.text}”</div>
            <div style={{ fontFamily: "var(--k-font-mono)", fontSize: 10.5, color: "var(--k-text-tertiary)", marginTop: 6 }}>— {answer.quote.source}</div>
          </div>
        )}

        {done && answer.draft && (
          <div className="kai-fade" style={{ margin: "2px 0 11px" }}>
            <DraftCard d={answer.draft} inserted={inserted} onInsert={() => { setInserted(true); onInsert(); }} />
          </div>
        )}

        {done && answer.citations && (
          <div className="kai-fade" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10.5, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
              {t("ai.assistantSources")} · {answer.citations.length}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {answer.citations.map((c, i) => <CitationCard key={i} c={c} />)}
            </div>
          </div>
        )}

        {done && answer.followups && (
          <div className="kai-fade" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {answer.followups.map((f, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onFollowup(f)}
                style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "5px 10px", border: "1px solid var(--k-border)", borderRadius: 999, color: "var(--k-text-secondary)", background: "white", cursor: "pointer" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--k-surface-2)"; e.currentTarget.style.color = "var(--k-text-primary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "white"; e.currentTarget.style.color = "var(--k-text-secondary)"; }}
              >
                <Sparkles style={{ width: 10, height: 10, color: "var(--k-accent)" }} />{f}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Composer ─────────────────────────────────────────────────────────────────
function Composer({ onSend, busy, onStop, ticketLabel, senderName }: {
  onSend: (text: string) => void;
  busy: boolean;
  onStop: () => void;
  ticketLabel: string;
  senderName: string;
}) {
  const { t } = useTranslation("dashboard");
  const [val, setVal] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const grow = (el: HTMLTextAreaElement) => { el.style.height = "auto"; el.style.height = Math.min(120, el.scrollHeight) + "px"; };
  const submit = () => {
    const text = val.trim();
    if (!text || busy) return;
    onSend(text);
    setVal("");
    if (ref.current) ref.current.style.height = "auto";
  };

  const chips: { icon: LucideIcon; label: string }[] = [
    { icon: TicketIcon, label: ticketLabel },
    { icon: User, label: senderName },
  ];

  return (
    <div style={{ borderTop: "1px solid var(--k-border)", padding: "10px 12px 12px", background: "white", flexShrink: 0 }}>
      <div style={{ border: "1px solid var(--k-border)", borderRadius: 12, background: "white", boxShadow: "var(--k-shadow-card)", overflow: "hidden" }}>
        {/* context row */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 8px 0", flexWrap: "wrap" }}>
          {chips.map((c, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontFamily: "var(--k-font-mono)", padding: "2px 7px", borderRadius: 6, background: "var(--k-surface)", border: "1px solid var(--k-border)", color: "var(--k-text-secondary)", maxWidth: 150 }}>
              <c.icon style={{ width: 11, height: 11, color: "var(--k-text-tertiary)", flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
            </span>
          ))}
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontFamily: "var(--k-font-mono)", padding: "2px 7px", borderRadius: 6, color: "var(--k-text-tertiary)", border: "1px dashed var(--k-border)" }}>
            <AtSign style={{ width: 11, height: 11 }} />{t("ai.assistantContextChip")}
          </span>
        </div>
        <textarea
          ref={ref}
          value={val}
          rows={1}
          onChange={(e) => { setVal(e.target.value); grow(e.target); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder={t("ai.assistantComposerPlaceholder")}
          style={{ width: "100%", border: "none", outline: "none", resize: "none", padding: "8px 12px 4px", fontSize: 13.5, lineHeight: 1.5, color: "var(--k-text-primary)", background: "transparent", display: "block", fontFamily: "inherit", boxSizing: "border-box" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px 8px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontFamily: "var(--k-font-mono)", color: "var(--k-text-secondary)", padding: "3px 7px", borderRadius: 6, border: "1px solid var(--k-border)" }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--k-gradient-ai)" }} />kairo-1
            <ChevronDown style={{ width: 11, height: 11, color: "var(--k-text-tertiary)" }} />
          </span>
          <span style={{ fontSize: 10.5, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)" }}>{t("ai.assistantModelContext")}</span>
          {busy ? (
            <button type="button" onClick={onStop} style={{ marginLeft: "auto", width: 30, height: 30, borderRadius: 8, background: "var(--k-surface-2)", display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer" }}>
              <Square style={{ width: 12, height: 12, color: "var(--k-text-secondary)" }} />
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={!val.trim()} style={{ marginLeft: "auto", width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: val.trim() ? "var(--k-accent)" : "var(--k-surface-2)", border: "none", cursor: val.trim() ? "pointer" : "default", transition: "background .12s" }}>
              <ArrowUp style={{ width: 15, height: 15, color: val.trim() ? "white" : "var(--k-text-tertiary)" }} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────
export function AssistantPanel() {
  const { t } = useTranslation("dashboard");
  const { selectedTicketId, tickets, setSuggestedReply } = useTriageStore();
  const selectedTicket = tickets.find((tk) => tk.id === selectedTicketId) ?? null;

  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy]   = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  // Reset the conversation whenever the selected ticket changes.
  useEffect(() => { setTurns([]); setBusy(false); }, [selectedTicketId]);

  // Keep the thread scrolled to the latest turn.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, busy]);

  function ask(text: string, starterId?: string) {
    if (busy) return;
    const answer = resolveAnswer(text, starterId);
    setBusy(true);
    const uid = ++seq.current;
    const aid = ++seq.current;
    setTurns((prev) => [...prev, { id: uid, role: "u", text }, { id: aid, role: "a", answer }]);
    const dur = 420 * answer.steps.length + 360
      + answer.prose.reduce((s, b) => s + (b.type === "bullets" ? b.items.join("").length : b.text.length) * 2.6, 0) + 600;
    setTimeout(() => setBusy(false), Math.min(dur, 7000));
  }

  // No ticket selected — nothing to reason about yet.
  if (!selectedTicket) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, height: "100%", padding: "32px 16px", textAlign: "center" }}>
        <AssistantMark size={30} />
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--k-text-secondary)", margin: 0 }}>{t("ai.assistantNoTicketTitle")}</p>
        <p style={{ fontSize: 11, color: "var(--k-text-tertiary)", margin: 0, lineHeight: 1.5 }}>{t("ai.assistantNoTicketBody")}</p>
      </div>
    );
  }

  const ticketLabel = `KAI-T-${selectedTicket.ticket_number}`;
  const senderName  = selectedTicket.from_name ?? selectedTicket.from_email ?? t("ai.assistantUnknownSender");
  const empty = turns.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: empty ? 0 : "16px 14px 8px", minHeight: 0 }}>
        {empty ? (
          <div style={{ padding: "22px 16px 8px", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <AssistantMark size={34} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>{t("ai.assistantName")}</div>
                <div style={{ fontSize: 12, color: "var(--k-text-tertiary)" }}>{t("ai.assistantTagline")}</div>
              </div>
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--k-text-secondary)", margin: "0 0 18px" }}>
              {t("ai.assistantIntro", { ticket: ticketLabel, name: senderName })}
            </p>
            <div style={{ fontSize: 10.5, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              {t("ai.assistantSuggestions")}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {STARTERS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => ask(t(s.labelKey), s.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", textAlign: "left", border: "1px solid var(--k-border)", borderRadius: 9, background: "white", fontSize: 13, color: "var(--k-text-primary)", lineHeight: 1.4, cursor: "pointer" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--k-accent-border)"; e.currentTarget.style.background = "var(--k-accent-faint)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--k-border)"; e.currentTarget.style.background = "white"; }}
                >
                  <div style={{ width: 26, height: 26, borderRadius: 6, background: "var(--k-accent-subtle)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <s.icon style={{ width: 14, height: 14, color: "var(--k-accent)" }} />
                  </div>
                  <span style={{ flex: 1 }}>{t(s.labelKey)}</span>
                  <ChevronRight style={{ width: 13, height: 13, color: "var(--k-text-tertiary)" }} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((turn) => turn.role === "u"
            ? <UserBubble key={turn.id} text={turn.text} />
            : <AssistantTurn
                key={turn.id}
                answer={turn.answer}
                onInsert={() => { if (turn.answer.draft) setSuggestedReply(turn.answer.draft.body); }}
                onFollowup={(f) => ask(f)}
              />)
        )}
      </div>
      <Composer onSend={(text) => ask(text)} busy={busy} onStop={() => setBusy(false)} ticketLabel={ticketLabel} senderName={senderName} />
    </div>
  );
}
