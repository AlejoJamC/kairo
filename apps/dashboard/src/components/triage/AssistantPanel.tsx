import { askAssistant } from "@kairo/client-core/endpoints";
import { getPlatform } from "@kairo/client-core/config";
import { z } from "zod";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { AskBox, AssistantEmpty, AssistantMark, AssistantTurn, Bold, Box, Button, DraftCard as DraftCardView, FollowUps, Icon, InlineCode, PromptStarters, SourceList, Text, UserTurn, type IconName } from "@kairo/ui";

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
    out.push(tok.startsWith("**")
      ? <Bold key={k++}>{tok.slice(2, -2)}</Bold>
      : <InlineCode key={k++}>{tok.slice(1, -1)}</InlineCode>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function AssistantDraft({ d, onInsert, inserted }: { d: Draft; onInsert: () => void; inserted: boolean }) {
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

// ── Assistant turn ───────────────────────────────────────────────────────────
function AnswerTurn({ answer, onInsert, onFollowup }: {
  answer: Answer;
  onInsert: () => void;
  onFollowup: (f: string) => void;
}) {
  const { t } = useTranslation("dashboard");
  const [inserted, setInserted] = useState(false);

  return (
    <AssistantTurn
      steps={answer.steps.map((step, index) => ({ id: String(index), label: step.label, detail: step.detail, status: "done" as const }))}
      phase="done"
      stepsLabels={{ thinking: t("ai.assistantThinking"), writing: t("ai.assistantWriting"), done: t("ai.assistantReasoned", { count: answer.steps.length }) }}
      draft={answer.draft && <AssistantDraft d={answer.draft} inserted={inserted} onInsert={() => { setInserted(true); onInsert(); }} />}
      sources={answer.citations && (
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
      )}
      followUps={answer.followups && (
        <FollowUps
          items={answer.followups.map((text, index) => ({ id: String(index), text }))}
          onPick={(id) => onFollowup(answer.followups![Number(id)]!)}
        />
      )}
    >
      {answer.prose.map((b, i) => b.type === "p"
        ? <Text tag="p" key={i} marginTop={0} marginHorizontal={0} marginBottom={9} fontSize={13.5} lineHeight={21.6} color="var(--k-text-secondary)" display="block">{renderInline(b.text)}</Text>
        : (
          <Box tag="ul" key={i} marginTop={0} marginHorizontal={0} marginBottom={9} paddingLeft={2} listStyle="none" display="flex" flexDirection="column" gap={6}>
            {b.items.map((it, j) => it !== "" && (
              <Text tag="li" key={j} display="flex" gap={8} fontSize={13} lineHeight={20.15} color="var(--k-text-secondary)">
                <Text marginTop={7} width={4} height={4} borderRadius={999} backgroundColor="var(--k-accent)" flexShrink={0} />
                <span>{renderInline(it)}</span>
              </Text>
            ))}
          </Box>
        ))}
      {answer.quote && (
        <Box marginTop={0} marginHorizontal={0} marginBottom={11} paddingVertical={10} paddingHorizontal={12} backgroundColor="var(--k-surface)" borderLeftWidth={2} borderLeftColor="var(--k-accent)" borderTopLeftRadius={0} borderTopRightRadius={8} borderBottomRightRadius={8} borderBottomLeftRadius={0} borderStyle="solid">
          <Text tag="div" fontSize={12.5} lineHeight={19.38} color="var(--k-text-primary)" fontStyle="italic" display="block">“{answer.quote.text}”</Text>
          <Text tag="div" font="mono" fontSize={10.5} color="var(--k-text-tertiary)" marginTop={6} display="block">— {answer.quote.source}</Text>
        </Box>
      )}
    </AssistantTurn>
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
  const [draft, setDraft] = useState("");
  const lastQuestion = useRef("");

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
    lastQuestion.current = text;
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
          <AssistantEmpty name={t("ai.assistantName")} tagline={t("ai.assistantTagline")} intro={t("ai.assistantIntro", { ticket: ticketLabel, name: senderName })}>
            <PromptStarters
              title={t("ai.assistantSuggestions")}
              items={STARTERS.map((st) => ({ id: st.id, icon: st.icon, text: t(st.labelKey) }))}
              onPick={(id) => {
                const starter = STARTERS.find((st) => st.id === id);
                if (starter) ask(t(starter.labelKey));
              }}
            />
          </AssistantEmpty>
        ) : (
          turns.map((turn) => turn.role === "u"
            ? <UserTurn key={turn.id}>{turn.text}</UserTurn>
            : <AnswerTurn
                key={turn.id}
                answer={turn.answer}
                onInsert={() => { if (turn.answer.draft) setSuggestedReply(turn.answer.draft.body); }}
                onFollowup={(f) => ask(f)}
              />)
        )}
      </Box>
      {busy && <Text tag="p" role="status" paddingVertical={0} paddingHorizontal={14} display="block">{t('ai.assistantWaiting')}</Text>}
      <Box borderTopWidth={1} borderTopColor="var(--k-border)" paddingTop={10} paddingHorizontal={12} paddingBottom={12} backgroundColor="var(--kairo-color-surface)" flexShrink={0} borderStyle="solid">
        <AskBox
          value={draft}
          onChange={setDraft}
          onSend={() => { const text = draft.trim(); if (!text || busy) return; setDraft(""); void ask(text); }}
          onStop={() => { controller.current?.abort(); setBusy(false); }}
          answering={busy}
          error={Boolean(error)}
          onRetry={() => { setDraft(""); void ask(lastQuestion.current); }}
          contexts={[
            { id: "ticket", icon: "ticket", label: ticketLabel },
            { id: "sender", icon: "user", label: senderName },
            { id: "add", icon: "mention", label: t("ai.assistantContextChip"), add: true },
          ]}
          model={modelName}
          hint={t("ai.assistantModelContext")}
          labels={{
            placeholder: t("ai.assistantComposerPlaceholder"),
            textarea: t("ai.assistantQuestionLabel"),
            send: t("ai.assistantSend"),
            stop: t("ai.assistantStop"),
            retry: t("ai.assistantRetry"),
            error: error ?? "",
          }}
        />
      </Box>
    </Box>
  );
}
