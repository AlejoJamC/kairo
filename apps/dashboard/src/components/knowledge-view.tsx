import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getKnowledgeDrafts, getKbEvidence, reviewKnowledge } from "@kairo/client-core/endpoints";
import { useAuth } from "@kairo/client-core/auth";
import type { AppView } from "@/types";
import { Box, Button, Chip, Field, FieldInput, FieldTextarea, Pressable, Spinner, Text } from "@kairo/ui";

type ArticleFilter = "draft" | "published";

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

export function KnowledgeView({ onViewChange: _onViewChange }: KnowledgeViewProps) {
  const { t } = useTranslation("dashboard");
  const { user } = useAuth();

  const [filter, setFilter] = useState<ArticleFilter>("draft");
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [evidence, setEvidence] = useState<{ steps: { feature: string; model: string; version: string | null }[]; evidence: string[] } | null>(null);
  const [evidenceError, setEvidenceError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getKnowledgeDrafts();
      if (res.ok) {
        const json: { articles: Article[] } = await res.json();
        setArticles(json.articles ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  const visible = articles.filter((a) => (filter === "draft" ? !a.is_published : Boolean(a.is_published)));
  const selected = visible.find((a) => a.id === selectedId) ?? null;
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

  const open = (article: Article) => {
    setError(false);
    setSelectedId(article.id);
    setTitle(article.title);
    setContent(article.content);
  };

  const save = async (article: Article, publish: boolean) => {
    setBusy(true);
    setError(false);
    try {
      const res = await reviewKnowledge(article.id, { title, content, kind: article.kind, versionId: article.versionId, decision: publish || article.is_published ? "approved" : "pending_review" });
      if (!res.ok) throw new Error(String(res.status));
      await load();
      if (publish) setSelectedId(null);
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

  return (
    <>
      <Box display="flex" flexDirection="column" overflow="hidden" backgroundColor="var(--k-surface)" width={selected ? 360 : undefined} minWidth={selected ? 360 : undefined} flex={selected ? undefined : 1} borderRightWidth={selected ? 1 : 0} borderRightColor="var(--k-border)" flexShrink={0} borderStyle="solid">
        <Box borderBottomWidth={1} borderBottomColor="var(--k-border)" backgroundColor="white" paddingVertical={16} paddingHorizontal={24} flexShrink={0} borderStyle="solid">
          <Text tag="h1" fontSize={18} fontWeight={600} color="var(--k-text-primary)" letterSpacing={-0.18} font="display" margin={0} display="block">
            {t("knowledgeView.title")}
          </Text>
          <Text tag="p" marginTop={2} fontSize={13} color="var(--k-text-tertiary)" display="block">{t("knowledgeView.subtitle")}</Text>
          <Box display="flex" gap={8} marginTop={12}>
            <Chip selected={filter === "draft"} onPress={() => { setFilter("draft"); setSelectedId(null); }}>
              {t("knowledgeView.tabDrafts")}
            </Chip>
            <Chip selected={filter === "published"} onPress={() => { setFilter("published"); setSelectedId(null); }}>
              {t("knowledgeView.tabPublished")}
            </Chip>
          </Box>
        </Box>

        <Box flexGrow={1} flexShrink={1} flexBasis="0%" scroll paddingBottom={8}>
          {loading && (
            <Box display="flex" alignItems="center" justifyContent="center" paddingTop={64}>
              <Spinner size="lg" />
            </Box>
          )}

          {!loading && visible.length === 0 && (
            <Text tag="div" display="flex" justifyContent="center" paddingTop={80} textAlign="center">
              <Text tag="p" fontSize={13} color="var(--k-text-tertiary)" display="block">
                {t(filter === "draft" ? "knowledgeView.emptyDrafts" : "knowledgeView.emptyPublished")}
              </Text>
            </Text>
          )}

          {!loading &&
            visible.map((article) => (
              <Pressable key={article.id} type="button" onClick={() => open(article)} display="block" width="100%" textAlign="left" paddingVertical={12} paddingHorizontal={24} borderBottomWidth={1} borderBottomColor="var(--k-border)" cursor="pointer" backgroundColor={selectedId === article.id ? "var(--k-bg)" : "transparent"} borderStyle="solid">
                <Text display="block" fontSize={14} fontWeight={500} color="var(--k-text-primary)">{article.title}</Text>
                <Text display="block" marginTop={2} fontSize={12} color="var(--k-text-tertiary)">
                  {(article.tags ?? []).includes(AI_DRAFT_TAG) ? t("knowledgeView.aiDraft") : t("knowledgeView.manual")}
                </Text>
              </Pressable>
            ))}
        </Box>
      </Box>

      {selected && (
        <Box flexGrow={1} flexShrink={1} flexBasis="0%" display="flex" flexDirection="column" minWidth={0} scroll backgroundColor="var(--k-surface)" padding={24} gap={12}>
          {selected.tags?.some(tag => tag.startsWith('source-message:')) && (
            <section aria-label={t('knowledgeView.evidenceTitle')}>
              <strong>{t('knowledgeView.evidenceTitle')}</strong>
              <p>{t('knowledgeView.validationScope')}</p>
              <p>{t(labelKey(KIND_KEYS, selected.tags.find(tag => tag.startsWith('type:'))?.slice(5) ?? 'article') ?? KIND_KEYS.article)}</p>
              <ul>
                {selected.tags.filter(tag => tag.startsWith('review:') && tag !== 'review:provider_not_calibrated').map(tag => (
                  <li key={tag}>{t(labelKey(REASON_KEYS, tag.slice(7)) ?? 'knowledgeView.evidenceUnavailable')}</li>
                ))}
              </ul>
              {evidenceError && <p role="alert">{t('knowledgeView.evidenceUnavailable')}</p>}
              {evidence?.evidence.map((quote, index) => <Text tag="blockquote" key={index} display="block" whiteSpace="pre-wrap">{quote}</Text>)}
              {evidence && !evidence.evidence.length && <p>{t('knowledgeView.evidenceUnavailable')}</p>}
              <ol>
                {evidence?.steps.map(step => <li key={step.feature}>{t(labelKey(STEP_KEYS, step.feature) ?? 'knowledgeView.evidenceTitle')} — {step.model} ({step.version})</li>)}
              </ol>
            </section>
          )}
          <Field label={t("knowledgeView.fieldTitle")}>
            <FieldInput value={title} onChangeText={setTitle} />
          </Field>
          <Field label={t("knowledgeView.fieldContent")}>
            <FieldTextarea value={content} onChangeText={setContent} minHeight={320} />
          </Field>
          <Box display="flex" alignItems="center" gap={8}>
            {!selected.is_published && (
              <Button variant="primary" disabled={busy} onPress={() => void save(selected, true)}>
              {t("knowledgeView.publish")}
            </Button>
            )}
            <Button disabled={busy} onPress={() => void save(selected, false)}>
              {t("knowledgeView.save")}
            </Button>
            <Button disabled={busy} onPress={() => void discard(selected)}>
              {selected.is_published ? t("knowledgeView.delete") : t("knowledgeView.discard")}
            </Button>
            {error && <Text fontSize={13} color="var(--k-danger, var(--kairo-color-bad-ink))">{t("knowledgeView.error")}</Text>}
          </Box>
        </Box>
      )}
    </>
  );
}
