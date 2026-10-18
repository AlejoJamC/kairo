import { askAssistant } from "@kairo/client-core/endpoints";
import { getPlatform } from "@kairo/client-core/config";
import { z } from "zod";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { Caret, Icon, Spinner, type IconName } from "@kairo/ui";

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
const STARTERS: { id: string; icon: IconName; labelKey: StarterKey }[] = [
  { id: "resume",  icon: "activity", labelKey: "ai.assistantStarterResume"  },
  { id: "policy",  icon: "knowledge", labelKey: "ai.assistantStarterPolicy"  },
  { id: "draft",   icon: "pen",  labelKey: "ai.assistantStarterDraft"   },
  { id: "similar", icon: "layers",   labelKey: "ai.assistantStarterSimilar" },
];

const AssistantResponseSchema = z.object({
  text: z.string(),
  model: z.string(),
  operations: z.array(z.object({
    tool: z.string(), result: z.object({ status: z.enum(['completed', 'proposed', 'failed']),
      data: z.record(z.string(), z.unknown()) }),
  })),
});
const ProposalSchema = z.object({ suggestion: z.string(), proposalId: z.string(), referencedKbArticles: z.array(z.string()) });

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
      <Icon name="spark" size={size * 0.56} color="white" />
    </div>
  );
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
          ? <Spinner />
          : <Icon name="check" size={12} color="var(--k-success)" />}
        <span>{done ? t("ai.assistantReasoned", { count: steps.length }) : t("ai.assistantThinking")}</span>
        <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", display: "inline-flex" }}>
          <Icon name="right" size={11} color="var(--k-text-tertiary)" />
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
          ? <Icon name="knowledge" size={12} color="var(--k-accent)" />
          : <Icon name="ticket" size={12} color="var(--k-text-secondary)" />}
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
          <Icon name="spark" size={9} /> {t("ai.assistantDraftBadge")}
        </span>
        <span style={{ fontSize: 11, color: "var(--k-text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.subject}</span>
      </div>
      <div style={{ padding: "11px 13px", fontSize: 12.5, lineHeight: 1.6, color: "var(--k-text-primary)", whiteSpace: "pre-wrap", maxHeight: 168, overflowY: "auto" }}>{d.body}</div>
      <div style={{ padding: "8px 10px", borderTop: "1px solid var(--k-border-subtle)", display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={() => { getPlatform().clipboard.writeText(d.body).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1400); }}
          style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, padding: "5px 9px", border: "1px solid var(--k-border)", borderRadius: 6, color: copied ? "var(--k-success)" : "var(--k-text-secondary)", background: "white", cursor: "pointer" }}
        >
          {copied ? <Icon name="check" size={12} /> : <Icon name="copy" size={12} />}
          {copied ? t("ai.assistantCopied") : t("ai.assistantCopy")}
        </button>
        <button
          type="button"
          onClick={onInsert}
          disabled={inserted}
          style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, padding: "5px 11px", borderRadius: 6, color: "white", background: inserted ? "var(--k-success)" : "var(--k-accent)", fontWeight: 500, border: "none", cursor: inserted ? "default" : "pointer" }}
        >
          {inserted ? <Icon name="check" size={12} /> : <Icon name="plus" size={12} />}
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
  const [phase] = useState<Phase>('done');
  const proseN = answer.prose.length;
  const charN = 0;
  const [inserted, setInserted] = useState(false);

  const visibleBlocks = answer.prose;
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
            return <p key={i} style={{ margin: "0 0 9px", fontSize: 13.5, lineHeight: 1.6, color: "var(--k-text-secondary)" }}>{renderInline(txt)}{streaming && <Caret display="inline-flex" marginLeft={1} marginBottom={-2} />}</p>;
          }
          const joined = b.items.join("\n");
          const shown = streaming ? joined.slice(0, charN).split("\n") : b.items;
          return (
            <ul key={i} style={{ margin: "0 0 9px", paddingLeft: 2, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
              {shown.map((it, j) => it !== "" && (
                <li key={j} style={{ display: "flex", gap: 8, fontSize: 13, lineHeight: 1.55, color: "var(--k-text-secondary)" }}>
                  <span style={{ marginTop: 7, width: 4, height: 4, borderRadius: 999, background: "var(--k-accent)", flexShrink: 0 }} />
                  <span>{renderInline(it)}{streaming && j === shown.length - 1 && <Caret display="inline-flex" marginLeft={1} marginBottom={-2} />}</span>
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
                <Icon name="spark" size={10} color="var(--k-accent)" />{f}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Composer ─────────────────────────────────────────────────────────────────
function Composer({ onSend, busy, onStop, ticketLabel, senderName, modelName }: {
  onSend: (text: string) => void;
  busy: boolean;
  onStop: () => void;
  ticketLabel: string;
  senderName: string;
  modelName: string;
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

  const chips: { icon: IconName; label: string }[] = [
    { icon: "ticket", label: ticketLabel },
    { icon: "user", label: senderName },
  ];

  return (
    <div style={{ borderTop: "1px solid var(--k-border)", padding: "10px 12px 12px", background: "white", flexShrink: 0 }}>
      <div style={{ border: "1px solid var(--k-border)", borderRadius: 12, background: "white", boxShadow: "var(--k-shadow-card)", overflow: "hidden" }}>
        {/* context row */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 8px 0", flexWrap: "wrap" }}>
          {chips.map((c, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontFamily: "var(--k-font-mono)", padding: "2px 7px", borderRadius: 6, background: "var(--k-surface)", border: "1px solid var(--k-border)", color: "var(--k-text-secondary)", maxWidth: 150 }}>
              <Icon name={c.icon} size={11} color="var(--k-text-tertiary)" />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
            </span>
          ))}
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontFamily: "var(--k-font-mono)", padding: "2px 7px", borderRadius: 6, color: "var(--k-text-tertiary)", border: "1px dashed var(--k-border)" }}>
            <Icon name="mention" size={11} />{t("ai.assistantContextChip")}
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px 8px", minWidth: 0 }}>
          {/* Model selector — keep the name on one line; clip rather than wrap
              when the panel is at its minimum width (it's a combobox: the full
              name reads again on resize / when more models are available). */}
          <span style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", fontSize: 11.5, fontFamily: "var(--k-font-mono)", color: "var(--k-text-secondary)", padding: "3px 7px", borderRadius: 6, border: "1px solid var(--k-border)" }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, flexShrink: 0, background: "var(--k-gradient-ai)" }} />{modelName}
          </span>
          {/* Helper text yields first: truncates with ellipsis before anything wraps. */}
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10.5, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)" }}>{t("ai.assistantModelContext")}</span>
          {busy ? (
            <button type="button" onClick={onStop} style={{ marginLeft: "auto", flexShrink: 0, width: 30, height: 30, borderRadius: 8, background: "var(--k-surface-2)", display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer" }}>
              <Icon name="square" size={12} color="var(--k-text-secondary)" />
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={!val.trim()} style={{ marginLeft: "auto", flexShrink: 0, width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: val.trim() ? "var(--k-accent)" : "var(--k-surface-2)", border: "none", cursor: val.trim() ? "pointer" : "default", transition: "background .12s" }}>
              <Icon name="escalate" size={15} color={val.trim() ? "white" : "var(--k-text-tertiary)"} />
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
  const controller = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelName, setModelName] = useState<string>(t('ai.assistantName'));

  // Reset the conversation whenever the selected ticket changes.
  useEffect(() => {
    controller.current?.abort(); setTurns([]); setBusy(false); setError(null);
    return () => controller.current?.abort();
  }, [selectedTicketId]);

  // Keep the thread scrolled to the latest turn.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, busy]);

  async function ask(text: string) {
    if (busy || !selectedTicketId) return;
    const abort = new AbortController();
    controller.current = abort;
    setError(null); setBusy(true);
    const uid = ++seq.current;
    const aid = ++seq.current;
    const history = turns.map((turn) => turn.role === 'u'
      ? { role: 'user' as const, content: turn.text }
      : { role: 'assistant' as const, content: turn.answer.prose.map((block) => block.type === 'p' ? block.text : block.items.join('\n')).join('\n') });
    setTurns((previous) => [...previous, { id: uid, role: 'u', text }]);
    try {
      const response = await askAssistant(selectedTicketId, [...history.slice(-18), { role: 'user', content: text }], abort.signal);
      if (!response.ok) throw new Error('Assistant request failed');
      const result = AssistantResponseSchema.parse(await response.json());
      if (abort.signal.aborted) return;
      setModelName(result.model);
      const draftOperation = [...result.operations].reverse().find((operation) => operation.tool === 'draft_reply' && operation.result.status === 'proposed');
      const proposal = ProposalSchema.safeParse(draftOperation?.result.data['proposal']);
      const answer: Answer = {
        steps: result.operations.map((operation) => ({
          label: t(operation.tool === 'inspect_ticket' ? 'ai.assistantToolInspect' : operation.tool === 'draft_reply' ? 'ai.assistantToolDraft' : 'ai.assistantToolDecide'),
          detail: t(`ai.assistantOperation_${operation.result.status}`),
        })),
        prose: [{ type: 'p', text: result.text }],
        ...(proposal.success ? { draft: { subject: selectedTicket?.subject ?? '', body: proposal.data.suggestion } } : {}),
      };
      setTurns((previous) => [...previous, { id: aid, role: 'a', answer }]);
    } catch {
      if (!abort.signal.aborted) setError(t('ai.assistantRequestFailed'));
    } finally {
      if (controller.current === abort) setBusy(false);
    }
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
                  onClick={() => ask(t(s.labelKey))}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", textAlign: "left", border: "1px solid var(--k-border)", borderRadius: 9, background: "white", fontSize: 13, color: "var(--k-text-primary)", lineHeight: 1.4, cursor: "pointer" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--k-accent-border)"; e.currentTarget.style.background = "var(--k-accent-faint)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--k-border)"; e.currentTarget.style.background = "white"; }}
                >
                  <div style={{ width: 26, height: 26, borderRadius: 6, background: "var(--k-accent-subtle)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name={s.icon} size={14} color="var(--k-accent)" />
                  </div>
                  <span style={{ flex: 1 }}>{t(s.labelKey)}</span>
                  <Icon name="right" size={13} color="var(--k-text-tertiary)" />
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
      {busy && <p role="status" style={{ padding: '0 14px' }}>{t('ai.assistantWaiting')}</p>}
      {error && <p role="alert" style={{ padding: '0 14px' }}>{error}</p>}
      <Composer modelName={modelName} onSend={(text) => ask(text)} busy={busy} onStop={() => { controller.current?.abort(); setBusy(false); }} ticketLabel={ticketLabel} senderName={senderName} />
    </div>
  );
}
