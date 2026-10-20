import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getKnowledgeDrafts, getKbEvidence, reviewKnowledge } from "@kairo/client-core/endpoints";
import { useAuth } from "@kairo/client-core/auth";
import type { AppView } from "@/types";
import { ArticleEditor, Box, Button, Callout, Card, KnowledgeList, PageFrame, Text, type ArticleDraft, type ArticleState, type KnowledgeArticleRow } from "@kairo/ui";

type ArticleFilter = "all" | ArticleState;

interface Article {
  id: string;
  kind: "article" | "learning";
  versionId: string;
  evidence?: string[];
  title: string;
  content: string;
  tags: string[] | null;
  is_published: boolean | null;
  updated_at: string | null;
}

interface KnowledgeViewProps {
  onViewChange: (view: AppView) => void;
}

const AI_DRAFT_TAG = "ai-draft";
const INTERNAL_TAG = /^(ai-draft|source-message:|type:|review:)/;
const KIND_KEYS = { business_fact: 'knowledgeView.kinds.business_fact', policy: 'knowledgeView.kinds.policy', exception: 'knowledgeView.kinds.exception', article: 'knowledgeView.kinds.article' } as const;
const REASON_KEYS = {
  human_validation_required: 'knowledgeView.reasons.human_validation_required',
  invalid_source_quote: 'knowledgeView.reasons.invalid_source_quote',
  unsupported_claim: 'knowledgeView.reasons.unsupported_claim',
  insufficient_evidence: 'knowledgeView.reasons.insufficient_evidence',
  business_context_conflict: 'knowledgeView.reasons.business_context_conflict',
  business_context_missing: 'knowledgeView.reasons.business_context_missing',
  source_truncated: 'knowledgeView.reasons.source_truncated',
  approved_knowledge_unavailable: 'knowledgeView.reasons.approved_knowledge_unavailable',
} as const;
const STEP_KEYS = { email_knowledge_decision: 'knowledgeView.steps.email_knowledge_decision', email_knowledge_extraction: 'knowledgeView.steps.email_knowledge_extraction', email_knowledge_validation: 'knowledgeView.steps.email_knowledge_validation' } as const;
function labelKey<T extends Record<string, string>>(keys: T, value: string): T[keyof T] | undefined {
  return Object.hasOwn(keys, value) ? keys[value as keyof T] : undefined;
}

function stateOf(article: Article): ArticleState {
  if (article.is_published) return "published";
  return (article.tags ?? []).includes(AI_DRAFT_TAG) ? "review" : "draft";
}

export function KnowledgeView({ onViewChange: _onViewChange }: KnowledgeViewProps) {
  const { t, i18n } = useTranslation("dashboard");
  const { user } = useAuth();

  const [filter, setFilter] = useState<ArticleFilter>("all");
  const [query, setQuery] = useState("");
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [evidence, setEvidence] = useState<{ steps: { feature: string; model: string; version: string | null }[]; evidence: string[] } | null>(null);
  const [evidenceError, setEvidenceError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await getKnowledgeDrafts();
      if (!res.ok) throw new Error(String(res.status));
      const json: { articles: Article[] } = await res.json();
      setArticles(json.articles ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  const selected = articles.find((a) => a.id === selectedId) ?? null;

  useEffect(() => {
    setEvidence(null);
    setEvidenceError(false);
    if (selected?.kind === 'learning') { setEvidence({ steps: [], evidence: selected.evidence ?? [] }); return; }
    if (!selected?.tags?.some(tag => tag.startsWith('source-message:'))) return;
    let active = true;
    void getKbEvidence(selected.id).then(async res => {
      if (!res.ok) throw new Error('Evidence unavailable');
      const data = await res.json();
      if (active) setEvidence(data);
    }).catch(() => { if (active) setEvidenceError(true); });
    return () => { active = false; };
  }, [selected?.id]);

  const open = (id: string) => {
    const article = articles.find((a) => a.id === id);
    if (!article) return;
    setError(false);
    setSelectedId(article.id);
    setTitle(article.title);
    setContent(article.content);
    setPublish(Boolean(article.is_published));
  };

  const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(i18n.language === "en" ? "en-US" : "es-ES") : "—");

  const rows: KnowledgeArticleRow[] = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return articles
      .map((article) => ({
        id: article.id,
        title: article.title,
        preview: article.content.split("\n").find((line) => line.trim()) ?? "",
        tags: (article.tags ?? []).filter((tag) => !INTERNAL_TAG.test(tag)),
        state: stateOf(article),
        updated: formatDate(article.updated_at),
        updatedAt: article.updated_at ?? "",
        content: article.content,
      }))
      .filter((row) => filter === "all" || row.state === filter)
      .filter((row) => !needle || [row.title, row.content, ...row.tags].some((text) => text.toLowerCase().includes(needle)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((row) => ({ id: row.id, title: row.title, preview: row.preview, tags: row.tags, state: row.state, updated: row.updated }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articles, filter, query, i18n.language]);

  const countOf = (state: ArticleState) => articles.filter((article) => stateOf(article) === state).length;

  const save = async (article: Article) => {
    setBusy(true);
    setError(false);
    try {
      const approve = publish || Boolean(article.is_published);
      const res = await reviewKnowledge(article.id, { title, content, kind: article.kind, versionId: article.versionId, decision: approve ? "approved" : "pending_review" });
      if (!res.ok) throw new Error(String(res.status));
      await load();
      if (approve) setSelectedId(null);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const discard = async (article: Article) => {
    setBusy(true);
    setError(false);
    try {
      const res = await reviewKnowledge(article.id, { kind: article.kind, versionId: article.versionId, decision: "rejected" });
      if (!res.ok) throw new Error(String(res.status));
      setArticles((prev) => prev.filter((a) => a.id !== article.id));
      setSelectedId(null);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  if (selected) {
    const draft: ArticleDraft = {
      title,
      content,
      published: publish,
      review: stateOf(selected) === "review" ? "review" : null,
      tags: (selected.tags ?? []).filter((tag) => !INTERNAL_TAG.test(tag)),
      updated: formatDate(selected.updated_at),
    };
    const hasSource = selected.tags?.some((tag) => tag.startsWith("source-message:"));
    return (
      <PageFrame narrow>
        <ArticleEditor
          value={draft}
          heading={t("knowledgeView.editArticle")}
          // An article that is already published cannot be unpublished from here.
          onChange={(patch) => {
            if (patch.title !== undefined) setTitle(patch.title);
            if (patch.content !== undefined) setContent(patch.content);
            if (patch.published !== undefined && !selected.is_published) setPublish(patch.published);
          }}
          canSave={!busy && title.trim() !== "" && content.trim() !== "" && (title !== selected.title || content !== selected.content || publish !== Boolean(selected.is_published))}
          saving={busy}
          dirty={title !== selected.title || content !== selected.content || publish !== Boolean(selected.is_published)}
          error={error ? t("knowledgeView.error") : undefined}
          onSave={() => void save(selected)}
          onBack={() => setSelectedId(null)}
          onDiscard={() => open(selected.id)}
          labels={{
            back: t("knowledgeView.title"),
            discard: t("knowledgeView.discardChanges"),
            save: t("knowledgeView.save"),
            title: t("knowledgeView.fieldTitle"),
            titlePlaceholder: t("knowledgeView.titlePlaceholder"),
            contentPlaceholder: t("knowledgeView.contentPlaceholder"),
            published: t("knowledgeView.published"),
            review: t("knowledgeView.review"),
            reviewStates: { review: t("knowledgeView.states.review"), reviewed: t("knowledgeView.states.reviewed") },
            markReviewed: "",
            tags: t("knowledgeView.tags"),
            addTag: "",
            removeTag: (tag) => tag,
            updated: t("knowledgeView.updated"),
            note: t("knowledgeView.note"),
            discardChanges: t("knowledgeView.discardChangesAsk"),
            confirmDiscard: t("knowledgeView.discardChanges"),
          }}
        />
        {hasSource && (
          <Card paddingVertical={16} paddingHorizontal={20} display="flex" flexDirection="column" gap={10} aria-label={t("knowledgeView.evidenceTitle")}>
            <Text tag="h2" margin={0} fontSize={15} fontWeight={600} color="var(--k-text-primary)">{t("knowledgeView.evidenceTitle")}</Text>
            <Text fontSize={12.5} color="var(--k-text-tertiary)">{t("knowledgeView.validationScope")}</Text>
            <Text fontSize={12.5} color="var(--k-text-secondary)">{t(labelKey(KIND_KEYS, selected.tags?.find((tag) => tag.startsWith("type:"))?.slice(5) ?? "article") ?? KIND_KEYS.article)}</Text>
            {(selected.tags ?? []).filter((tag) => tag.startsWith("review:") && tag !== "review:provider_not_calibrated").map((tag) => (
              <Callout key={tag} tone="note">{t(labelKey(REASON_KEYS, tag.slice(7)) ?? "knowledgeView.evidenceUnavailable")}</Callout>
            ))}
            {evidenceError && <Callout tone="error">{t("knowledgeView.evidenceUnavailable")}</Callout>}
            {evidence?.evidence.map((quote, index) => (
              <Text tag="blockquote" key={index} display="block" margin={0} paddingLeft={12} borderLeftWidth={2} borderLeftColor="var(--k-border)" borderStyle="solid" whiteSpace="pre-wrap" fontSize={13} color="var(--k-text-secondary)">{quote}</Text>
            ))}
            {evidence && !evidence.evidence.length && <Text fontSize={12.5} color="var(--k-text-tertiary)">{t("knowledgeView.evidenceUnavailable")}</Text>}
            {evidence?.steps.map((step) => (
              <Text key={step.feature} font="mono" fontSize={11.5} color="var(--k-text-tertiary)">
                {t(labelKey(STEP_KEYS, step.feature) ?? "knowledgeView.evidenceTitle")} — {step.model} ({step.version})
              </Text>
            ))}
          </Card>
        )}
        <Box display="flex">
          <Button disabled={busy} onPress={() => void discard(selected)}>
            {selected.is_published ? t("knowledgeView.delete") : t("knowledgeView.discard")}
          </Button>
        </Box>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <KnowledgeList
        title={t("knowledgeView.title")}
        total={loading ? null : articles.length}
        countLabel={t("knowledgeView.countLabel", { count: articles.length })}
        description={t("knowledgeView.subtitle")}
        // Articles are proposed from emails and tickets; there is no endpoint to write one by hand.
        canEdit={false}
        onAdd={() => {}}
        filters={[
          { id: "all", label: t("knowledgeView.filterAll"), count: loading ? null : articles.length },
          { id: "published", label: t("knowledgeView.states.published"), count: loading ? null : countOf("published") },
          { id: "draft", label: t("knowledgeView.tabDrafts"), count: loading ? null : countOf("draft") },
          { id: "review", label: t("knowledgeView.states.review"), count: loading ? null : countOf("review") },
        ]}
        filter={filter}
        onFilter={(id) => setFilter(id as ArticleFilter)}
        query={query}
        onQuery={setQuery}
        articles={rows}
        onOpen={open}
        loading={loading}
        error={loadError ? { message: t("knowledgeView.loadError"), retryLabel: t("replyBar.retry"), onRetry: () => void load() } : undefined}
        empty={!loading && !loadError && articles.length === 0}
        labels={{
          add: t("knowledgeView.add"),
          filters: t("knowledgeView.filters"),
          search: t("knowledgeView.search"),
          article: t("knowledgeView.colArticle"),
          tags: t("knowledgeView.tags"),
          state: t("knowledgeView.colState"),
          updated: t("knowledgeView.updated"),
          states: { published: t("knowledgeView.states.published"), draft: t("knowledgeView.states.draft"), review: t("knowledgeView.states.review") },
          emptyTitle: t("knowledgeView.emptyTitle"),
          emptyDescription: t("knowledgeView.emptyDescription"),
          noResults: t("knowledgeView.noResults"),
        }}
      />
    </PageFrame>
  );
}
