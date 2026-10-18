import { askAssistant } from "@kairo/client-core/endpoints";
import { getPlatform } from "@kairo/client-core/config";
import { z } from "zod";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { Box, Button, Caret, DraftCard as DraftCardView, FollowUps, Icon, PlainTextarea, Pressable, PromptStarters, SourceList, Spinner, Text, type IconName } from "@kairo/ui";

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
      out.push(<Text tag="strong" key={k++} fontWeight={600} color="var(--k-text-primary)">{tok.slice(2, -2)}</Text>);
    } else {
      out.push(<Text tag="code" key={k++} font="mono" fontSize={12} backgroundColor="var(--k-surface-2)" paddingVertical={1} paddingHorizontal={5} borderRadius={4} color="var(--k-text-primary)">{tok.slice(1, -1)}</Text>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// ── Atoms ────────────────────────────────────────────────────────────────────
function AssistantMark({ size = 24 }: { size?: number }) {
  return (
    <Box width={size} height={size} borderRadius={7} flexShrink={0} backgroundColor="var(--k-gradient-ai)" display="flex" alignItems="center" justifyContent="center" boxShadow="0 0 0 1px rgba(43,91,255,0.18), 0 4px 12px rgba(43,91,255,0.28)">
      <Icon name="spark" size={size * 0.56} color="white" />
    </Box>
  );
}

// ── Reasoning stepper ────────────────────────────────────────────────────────
function Steps({ steps, phase }: { steps: Step[]; phase: Phase }) {
  const { t } = useTranslation("dashboard");
  const [open, setOpen] = useState(true);
  const done = phase !== "thinking";
  useEffect(() => { if (done) setOpen(false); }, [done]);
  return (
    <Box marginBottom={10}>
      <Pressable type="button" onClick={() => setOpen((o) => !o)} display="flex" alignItems="center" gap={6} fontSize={11.5} font="mono" color="var(--k-text-tertiary)" paddingVertical={2} paddingHorizontal={0} backgroundColor="transparent" borderWidth={0} cursor="pointer">
        {!done
          ? <Spinner />
          : <Icon name="check" size={12} color="var(--k-success)" />}
        <span>{done ? t("ai.assistantReasoned", { count: steps.length }) : t("ai.assistantThinking")}</span>
        <Text transform={open ? "rotate(90deg)" : "none"} transition="transform .15s" display="inline-flex">
          <Icon name="right" size={11} color="var(--k-text-tertiary)" />
        </Text>
      </Pressable>
      {open && (
        <Box marginTop={6} marginLeft={5} paddingLeft={12} borderLeftWidth={1} borderLeftColor="var(--k-border-subtle)" display="flex" flexDirection="column" gap={7} borderStyle="solid">
          {steps.map((s, i) => (
            <Text tag="div" key={i} display="flex" alignItems="center" gap={7} fontSize={12}>
              <Text width={5} height={5} borderRadius={999} backgroundColor="var(--k-success)" flexShrink={0} />
              <Text color="var(--k-text-secondary)">{s.label}</Text>
              <Text font="mono" fontSize={10.5} color="var(--k-text-tertiary)">{s.detail}</Text>
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

function DraftCard({ d, onInsert, inserted }: { d: Draft; onInsert: () => void; inserted: boolean }) {
  const { t } = useTranslation("dashboard");
  const [copied, setCopied] = useState(false);
  return (
    <DraftCardView
      badge={t("ai.assistantDraftBadge")}
      heading={d.subject}
      body={d.body}
      actions={
        <>
          <Button
            size="sm"
            icon={<Icon name={copied ? "check" : "copy"} size={12} />}
            onPress={() => {
              getPlatform().clipboard.writeText(d.body).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            }}
          >
            {copied ? t("ai.assistantCopied") : t("ai.assistantCopy")}
          </Button>
          <Button variant="primary" size="sm" disabled={inserted} icon={<Icon name={inserted ? "check" : "plus"} size={12} color="white" />} onPress={onInsert}>
            {inserted ? t("ai.assistantInserted") : t("ai.assistantInsert")}
          </Button>
        </>
      }
    />
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <Box display="flex" justifyContent="flex-end" marginBottom={18}>
      <Text tag="div" maxWidth="85%" paddingVertical={8} paddingHorizontal={12} borderTopLeftRadius={12} borderTopRightRadius={12} borderBottomRightRadius={4} borderBottomLeftRadius={12} backgroundColor="var(--k-surface-2)" color="var(--k-text-primary)" fontSize={13.5} lineHeight={20.25} display="block">{text}</Text>
    </Box>
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
    <Box display="flex" gap={9} marginBottom={20}>
      <AssistantMark size={24} />
      <Box flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0} paddingTop={1}>
        <Steps steps={answer.steps} phase={phase} />

        {visibleBlocks.map((b, i) => {
          const streaming = phase === "streaming" && i === proseN;
          if (b.type === "p") {
            const txt = streaming ? b.text.slice(0, charN) : b.text;
            return <Text tag="p" key={i} marginTop={0} marginHorizontal={0} marginBottom={9} fontSize={13.5} lineHeight={21.6} color="var(--k-text-secondary)" display="block">{renderInline(txt)}{streaming && <Caret display="inline-flex" marginLeft={1} marginBottom={-2} />}</Text>;
          }
          const joined = b.items.join("\n");
          const shown = streaming ? joined.slice(0, charN).split("\n") : b.items;
          return (
            <Box tag="ul" key={i} marginTop={0} marginHorizontal={0} marginBottom={9} paddingLeft={2} listStyle="none" display="flex" flexDirection="column" gap={6}>
              {shown.map((it, j) => it !== "" && (
                <Text tag="li" key={j} display="flex" gap={8} fontSize={13} lineHeight={20.15} color="var(--k-text-secondary)">
                  <Text marginTop={7} width={4} height={4} borderRadius={999} backgroundColor="var(--k-accent)" flexShrink={0} />
                  <span>{renderInline(it)}{streaming && j === shown.length - 1 && <Caret display="inline-flex" marginLeft={1} marginBottom={-2} />}</span>
                </Text>
              ))}
            </Box>
          );
        })}

        {done && answer.quote && (
          <Box marginTop={0} marginHorizontal={0} marginBottom={11} paddingVertical={10} paddingHorizontal={12} backgroundColor="var(--k-surface)" borderLeftWidth={2} borderLeftColor="var(--k-accent)" borderTopLeftRadius={0} borderTopRightRadius={8} borderBottomRightRadius={8} borderBottomLeftRadius={0} borderStyle="solid">
            <Text tag="div" fontSize={12.5} lineHeight={19.38} color="var(--k-text-primary)" fontStyle="italic" display="block">“{answer.quote.text}”</Text>
            <Text tag="div" font="mono" fontSize={10.5} color="var(--k-text-tertiary)" marginTop={6} display="block">— {answer.quote.source}</Text>
          </Box>
        )}

        {done && answer.draft && (
          <Box fadeIn marginTop={2} marginHorizontal={0} marginBottom={11}>
            <DraftCard d={answer.draft} inserted={inserted} onInsert={() => { setInserted(true); onInsert(); }} />
          </Box>
        )}

        {done && answer.citations && (
          <Box marginBottom={12}>
            <SourceList
              title={`${t("ai.assistantSources")} · ${answer.citations.length}`}
              items={answer.citations.map((c, index) => ({
                id: String(index),
                kind: "ticket" as const,
                icon: c.kind === "kb" ? ("knowledge" as const) : undefined,
                code: c.id,
                title: c.title,
                meta: c.meta,
              }))}
            />
          </Box>
        )}

        {done && answer.followups && (
          <Box fadeIn>
            <FollowUps
              items={answer.followups.map((text, index) => ({ id: String(index), text }))}
              onPick={(id) => onFollowup(answer.followups![Number(id)]!)}
            />
          </Box>
        )}
      </Box>
    </Box>
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
    <Box borderTopWidth={1} borderTopColor="var(--k-border)" paddingTop={10} paddingHorizontal={12} paddingBottom={12} backgroundColor="white" flexShrink={0} borderStyle="solid">
      <Box borderWidth={1} borderColor="var(--k-border)" borderRadius={12} backgroundColor="white" boxShadow="var(--k-shadow-card)" overflow="hidden" borderStyle="solid">
        {/* context row */}
        <Box display="flex" alignItems="center" gap={5} paddingTop={7} paddingHorizontal={8} paddingBottom={0} flexWrap="wrap">
          {chips.map((c, i) => (
            <Text key={i} display="flex" alignItems="center" gap={5} fontSize={11} font="mono" paddingVertical={2} paddingHorizontal={7} borderRadius={6} backgroundColor="var(--k-surface)" borderWidth={1} borderColor="var(--k-border)" color="var(--k-text-secondary)" maxWidth={150} borderStyle="solid">
              <Icon name={c.icon} size={11} color="var(--k-text-tertiary)" />
              <Text overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">{c.label}</Text>
            </Text>
          ))}
          <Text display="flex" alignItems="center" gap={4} fontSize={11} font="mono" paddingVertical={2} paddingHorizontal={7} borderRadius={6} color="var(--k-text-tertiary)" borderWidth={1} borderColor="var(--k-border)" borderStyle="dashed">
            <Icon name="mention" size={11} />{t("ai.assistantContextChip")}
          </Text>
        </Box>
        <PlainTextarea ref={ref} value={val} rows={1} onChange={(e) => { setVal(e.target.value); grow(e.target); }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} placeholder={t("ai.assistantComposerPlaceholder")} width="100%" borderWidth={0} outlineWidth={0} resize="none" paddingTop={8} paddingHorizontal={12} paddingBottom={4} fontSize={13.5} lineHeight={20.25} color="var(--k-text-primary)" backgroundColor="transparent" display="block" />
        <Box display="flex" alignItems="center" gap={8} paddingTop={4} paddingHorizontal={8} paddingBottom={8} minWidth={0}>
          {/* Model selector — keep the name on one line; clip rather than wrap
              when the panel is at its minimum width (it's a combobox: the full
              name reads again on resize / when more models are available). */}
          <Text display="flex" alignItems="center" gap={5} flexShrink={0} whiteSpace="nowrap" overflow="hidden" fontSize={11.5} font="mono" color="var(--k-text-secondary)" paddingVertical={3} paddingHorizontal={7} borderRadius={6} borderWidth={1} borderColor="var(--k-border)" borderStyle="solid">
            <Text width={6} height={6} borderRadius={999} flexShrink={0} backgroundColor="var(--k-gradient-ai)" />{modelName}
          </Text>
          {/* Helper text yields first: truncates with ellipsis before anything wraps. */}
          <Text flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" fontSize={10.5} font="mono" color="var(--k-text-tertiary)">{t("ai.assistantModelContext")}</Text>
          {busy ? (
            <Pressable type="button" onClick={onStop} marginLeft="auto" flexShrink={0} width={30} height={30} borderRadius={8} backgroundColor="var(--k-surface-2)" display="flex" alignItems="center" justifyContent="center" borderWidth={0} cursor="pointer">
              <Icon name="square" size={12} color="var(--k-text-secondary)" />
            </Pressable>
          ) : (
            <Pressable type="button" onClick={submit} disabled={!val.trim()} marginLeft="auto" flexShrink={0} width={30} height={30} borderRadius={8} display="flex" alignItems="center" justifyContent="center" backgroundColor={val.trim() ? "var(--k-accent)" : "var(--k-surface-2)"} borderWidth={0} cursor={val.trim() ? "pointer" : "default"} transition="background .12s">
              <Icon name="escalate" size={15} color={val.trim() ? "white" : "var(--k-text-tertiary)"} />
            </Pressable>
          )}
        </Box>
      </Box>
    </Box>
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
      <Text tag="div" display="flex" flexDirection="column" alignItems="center" justifyContent="center" gap={8} height="100%" paddingVertical={32} paddingHorizontal={16} textAlign="center">
        <AssistantMark size={30} />
        <Text tag="p" fontSize={13} fontWeight={600} color="var(--k-text-secondary)" margin={0} display="block">{t("ai.assistantNoTicketTitle")}</Text>
        <Text tag="p" fontSize={11} color="var(--k-text-tertiary)" margin={0} lineHeight={16.5} display="block">{t("ai.assistantNoTicketBody")}</Text>
      </Text>
    );
  }

  const ticketLabel = `KAI-T-${selectedTicket.ticket_number}`;
  const senderName  = selectedTicket.from_name ?? selectedTicket.from_email ?? t("ai.assistantUnknownSender");
  const empty = turns.length === 0;

  return (
    <Box display="flex" flexDirection="column" height="100%" minHeight={0}>
      <Box ref={scrollRef} flexGrow={1} flexShrink={1} flexBasis="0%" scroll paddingTop={empty ? 0 : 16} paddingRight={empty ? 0 : 14} paddingBottom={empty ? 0 : 8} paddingLeft={empty ? 0 : 14} minHeight={0}>
        {empty ? (
          <Box paddingTop={22} paddingHorizontal={16} paddingBottom={8} display="flex" flexDirection="column">
            <Box display="flex" alignItems="center" gap={10} marginBottom={12}>
              <AssistantMark size={34} />
              <div>
                <Text tag="div" fontSize={15} fontWeight={600} letterSpacing={-0.15} display="block">{t("ai.assistantName")}</Text>
                <Text tag="div" fontSize={12} color="var(--k-text-tertiary)" display="block">{t("ai.assistantTagline")}</Text>
              </div>
            </Box>
            <Text tag="p" fontSize={13.5} lineHeight={21.6} color="var(--k-text-secondary)" marginTop={0} marginHorizontal={0} marginBottom={18} display="block">
              {t("ai.assistantIntro", { ticket: ticketLabel, name: senderName })}
            </Text>
            <PromptStarters
              title={t("ai.assistantSuggestions")}
              items={STARTERS.map((st) => ({ id: st.id, icon: st.icon, text: t(st.labelKey) }))}
              onPick={(id) => {
                const starter = STARTERS.find((st) => st.id === id);
                if (starter) ask(t(starter.labelKey));
              }}
            />
          </Box>
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
      </Box>
      {busy && <Text tag="p" role="status" paddingVertical={0} paddingHorizontal={14} display="block">{t('ai.assistantWaiting')}</Text>}
      {error && <Text tag="p" role="alert" paddingVertical={0} paddingHorizontal={14} display="block">{error}</Text>}
      <Composer modelName={modelName} onSend={(text) => ask(text)} busy={busy} onStop={() => { controller.current?.abort(); setBusy(false); }} ticketLabel={ticketLabel} senderName={senderName} />
    </Box>
  );
}
