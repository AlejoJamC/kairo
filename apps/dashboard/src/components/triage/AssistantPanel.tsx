import { askAccountAssistant, askAssistant } from "@kairo/client-core/endpoints";
import { getPlatform } from "@kairo/client-core/config";
import { z } from "zod";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { EMPTY_CHAT, useAssistantChats, type AssistantAnswer } from "@kairo/client-core/stores/assistant-chat-store";
import { useAuth } from "@kairo/client-core/auth";
import { useAppCommands } from "@/lib/app-commands";
import { ASSISTANT_OPEN_CHAT_ENABLED } from "@/lib/panel-flags";
import { AskBox, AssistantEmpty, AssistantMark, AssistantTurn, Bold, Box, Button, DraftCard as DraftCardView, FollowUps, Icon, InlineCode, PromptStarters, SourceList, Text, UserTurn, type IconName } from "@kairo/ui";

// ── Types ───────────────────────────────────────────────────────────────────
type Answer = AssistantAnswer;
type Citation = NonNullable<Answer["citations"]>[number];
/** Requests in flight by conversation: a request outlives a ticket switch and lands in its own chat. */
const inFlight = new Map<string, AbortController>();

// ── Starters (suggestion chips) — labels are i18n, answers are scripted ───────
type StarterKey =
  | "ai.assistantStarterResume"
  | "ai.assistantStarterPolicy"
  | "ai.assistantStarterDraft"
  | "ai.assistantStarterSimilar";
type AccountStarterKey = "ai.assistantAccountStarterKnowledge" | "ai.assistantAccountStarterRecent";
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
const ACCOUNT_STARTERS: { id: string; icon: IconName; labelKey: AccountStarterKey }[] = [
  { id: "knowledge", icon: "knowledge", labelKey: "ai.assistantAccountStarterKnowledge" },
  { id: "recent",    icon: "activity",  labelKey: "ai.assistantAccountStarterRecent"    },
];
const TOOL_LABELS = {
  inspect_ticket: "ai.assistantToolInspect", draft_reply: "ai.assistantToolDraft", read_account_memory: "ai.assistantToolMemory",
  search_similar_cases: "ai.assistantToolSimilar", list_account_tickets: "ai.assistantToolTickets",
} as const;
const CaseSchema = z.object({ id: z.string(), ticketNumber: z.number().optional(), subject: z.string().nullable().optional() });
const ArticleSchema = z.object({ id: z.string(), title: z.string().optional(), content: z.string().optional() });
const TicketRowSchema = z.object({ id: z.string(), subject: z.string().nullable().optional() });

/** The articles and cases the assistant's reads brought back, deduplicated, as the sources of its answer. */
function citationsFrom(operations: { tool: string; result: { status: string; data: Record<string, unknown> } }[], labels: { article: string; resolved: string; ticket: string }): Citation[] {
  const found = new Map<string, Citation>();
  for (const { result, tool } of operations) {
    if (result.status !== "completed") continue;
    const articles = z.array(ArticleSchema).safeParse(tool === "inspect_ticket" ? result.data["knowledge"] : result.data["approvedKnowledge"]);
    for (const a of articles.success ? articles.data : []) {
      found.set(`kb:${a.id}`, { kind: "kb", id: "KB", title: a.title ?? (a.content ?? "").slice(0, 80), meta: labels.article });
    }
    const cases = z.array(CaseSchema).safeParse(result.data["resolvedCases"]);
    for (const c of cases.success ? cases.data : []) {
      found.set(`case:${c.id}`, { kind: "ticket", id: c.ticketNumber === undefined ? "" : `KAI-T-${c.ticketNumber}`, title: c.subject ?? "", meta: labels.resolved });
    }
    const tickets = tool === "list_account_tickets" ? z.array(TicketRowSchema).safeParse(result.data["tickets"]) : null;
    for (const row of tickets?.success ? tickets.data : []) {
      found.set(`ticket:${row.id}`, { kind: "ticket", id: "", title: row.subject ?? "", meta: labels.ticket });
    }
  }
  return [...found.values()].slice(0, 8);
}
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

function AssistantDraft({ d, onInsert, inserted }: { d: NonNullable<Answer["draft"]>; onInsert: () => void; inserted: boolean }) {
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
  // Without a ticket the chat exists only while the open-chat flag is on.
  const accountMode = !selectedTicket && ASSISTANT_OPEN_CHAT_ENABLED;
  const focusPending = useAppCommands((state) => state.assistantFocusPending);
  const clearFocus = useAppCommands((state) => state.clearAssistantFocus);
  // Without a ticket there is no input to focus: the request ends here.
  useEffect(() => {
    if (focusPending && !selectedTicket && !accountMode) clearFocus();
  }, [focusPending, selectedTicket, accountMode, clearFocus]);

  const { user } = useAuth();
  const chatKey = `${user?.id ?? "anonymous"}:${selectedTicketId ?? "account"}`;
  const chat = useAssistantChats((state) => state.chats[chatKey]) ?? EMPTY_CHAT;
  const { turns, busy, draft } = chat;
  const error = chat.failed ? t("ai.assistantRequestFailed") : null;
  const openChat = useAssistantChats((state) => state.open);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [modelName, setModelName] = useState<string>(t('ai.assistantName'));

  // Each ticket keeps its own conversation: switching loads the one already there instead of starting over.
  useEffect(() => { openChat(chatKey); }, [chatKey, openChat]);

  // Keep the thread scrolled to the latest turn.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, busy, chatKey]);

  async function ask(text: string) {
    if (busy || (!selectedTicketId && !accountMode)) return;
    const key = chatKey;
    const ticketId = selectedTicketId;
    const subject = selectedTicket?.subject ?? '';
    const chats = useAssistantChats.getState();
    const abort = new AbortController();
    inFlight.set(key, abort);
    chats.setBusy(key, true);
    const history = turns.map((turn) => turn.role === 'u'
      ? { role: 'user' as const, content: turn.text }
      : { role: 'assistant' as const, content: turn.answer.prose.map((block) => block.type === 'p' ? block.text : block.items.join('\n')).join('\n') });
    chats.addQuestion(key, text);
    try {
      const messages = [...history.slice(-18), { role: 'user', content: text }];
      const response = ticketId ? await askAssistant(ticketId, messages, abort.signal) : await askAccountAssistant(messages, abort.signal);
      if (!response.ok) throw new Error('Assistant request failed');
      const result = AssistantResponseSchema.parse(await response.json());
      if (abort.signal.aborted) return;
      setModelName(result.model);
      const draftOperation = [...result.operations].reverse().find((operation) => operation.tool === 'draft_reply' && operation.result.status === 'proposed');
      const proposal = ProposalSchema.safeParse(draftOperation?.result.data['proposal']);
      const answer: Answer = {
        steps: result.operations.map((operation) => ({
          label: t(TOOL_LABELS[operation.tool as keyof typeof TOOL_LABELS] ?? 'ai.assistantToolDecide'),
          detail: t(`ai.assistantOperation_${operation.result.status}`),
        })),
        prose: [{ type: 'p', text: result.text }],
        citations: citationsFrom(result.operations, { article: t('ai.assistantSourceArticle'), resolved: t('ai.assistantSourceCase'), ticket: t('ai.assistantSourceTicket') }),
        ...(proposal.success ? { draft: { subject, body: proposal.data.suggestion } } : {}),
      };
      useAssistantChats.getState().addAnswer(key, answer);
    } catch {
      if (!abort.signal.aborted) useAssistantChats.getState().setFailed(key, true);
    } finally {
      if (inFlight.get(key) === abort) { inFlight.delete(key); useAssistantChats.getState().setBusy(key, false); }
    }
  }

  // No ticket selected and no open chat — nothing to reason about yet.
  if (!selectedTicket && !accountMode) {
    return (
      <Text tag="div" display="flex" flexDirection="column" alignItems="center" justifyContent="center" gap={8} height="100%" paddingVertical={32} paddingHorizontal={16} textAlign="center">
        <AssistantMark size={30} />
        <Text tag="p" fontSize={13} fontWeight={600} color="var(--k-text-secondary)" margin={0} display="block">{t("ai.assistantNoTicketTitle")}</Text>
        <Text tag="p" fontSize={11} color="var(--k-text-tertiary)" margin={0} lineHeight={16.5} display="block">{t("ai.assistantNoTicketBody")}</Text>
      </Text>
    );
  }

  const ticketLabel = selectedTicket ? `KAI-T-${selectedTicket.ticket_number}` : "";
  const senderName  = selectedTicket ? selectedTicket.from_name ?? selectedTicket.from_email ?? t("ai.assistantUnknownSender") : "";
  const empty = turns.length === 0;

  return (
    <Box display="flex" flexDirection="column" height="100%" minHeight={0}>
      <Box ref={scrollRef} flexGrow={1} flexShrink={1} flexBasis="0%" scroll paddingTop={empty ? 0 : 16} paddingRight={empty ? 0 : 14} paddingBottom={empty ? 0 : 8} paddingLeft={empty ? 0 : 14} minHeight={0}>
        {empty ? (
          <AssistantEmpty name={t("ai.assistantName")} tagline={accountMode ? t("ai.assistantAccountTagline") : t("ai.assistantTagline")} intro={accountMode ? t("ai.assistantAccountIntro") : t("ai.assistantIntro", { ticket: ticketLabel, name: senderName })}>
            <PromptStarters
              title={t("ai.assistantSuggestions")}
              items={(accountMode ? ACCOUNT_STARTERS : STARTERS).map((st) => ({ id: st.id, icon: st.icon, text: t(st.labelKey) }))}
              onPick={(id) => {
                const starter = (accountMode ? ACCOUNT_STARTERS : STARTERS).find((st) => st.id === id);
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
      {busy && <Text tag="p" role="status" paddingVertical={0} paddingHorizontal={14} display="block">{accountMode ? t('ai.assistantAccountWaiting') : t('ai.assistantWaiting')}</Text>}
      <Box borderTopWidth={1} borderTopColor="var(--k-border)" paddingTop={10} paddingHorizontal={12} paddingBottom={12} backgroundColor="var(--kairo-color-surface)" flexShrink={0} borderStyle="solid">
        <AskBox
          value={draft}
          onChange={(value) => useAssistantChats.getState().setDraft(chatKey, value)}
          onSend={() => { const text = draft.trim(); if (!text || busy) return; useAssistantChats.getState().setDraft(chatKey, ""); void ask(text); }}
          onStop={() => { inFlight.get(chatKey)?.abort(); inFlight.delete(chatKey); useAssistantChats.getState().setBusy(chatKey, false); }}
          autoFocus={focusPending}
          onFocused={clearFocus}
          answering={busy}
          error={Boolean(error)}
          onRetry={() => { useAssistantChats.getState().setDraft(chatKey, ""); void ask(chat.lastQuestion); }}
          contexts={accountMode ? [] : [
            { id: "ticket", icon: "ticket", label: ticketLabel },
            { id: "sender", icon: "user", label: senderName },
            { id: "add", icon: "mention", label: t("ai.assistantContextChip"), add: true },
          ]}
          model={modelName}
          hint={accountMode ? t("ai.assistantAccountContext") : t("ai.assistantModelContext")}
          labels={{
            placeholder: accountMode ? t("ai.assistantAccountPlaceholder") : t("ai.assistantComposerPlaceholder"),
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
