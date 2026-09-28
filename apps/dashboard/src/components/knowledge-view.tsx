import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock } from "lucide-react";
import { apiCall } from "@/lib/api-client";
import { useAuth } from "@/contexts/auth-context";
import type { AppView } from "@/types";

type ArticleFilter = "draft" | "published";

interface Article {
  id: string;
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiCall("/api/v1/kb-articles");
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
      const res = await apiCall(`/api/v1/kb-articles/${article.id}`, {
        method: "PUT",
        body: JSON.stringify({ title, content, ...(publish ? { is_published: true } : {}) }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const updated: Article = await res.json();
      setArticles((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
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
      const res = await apiCall(`/api/v1/kb-articles/${article.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      setArticles((prev) => prev.filter((a) => a.id !== article.id));
      setSelectedId(null);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const tabStyle = (active: boolean) => ({
    padding: "6px 12px",
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 6,
    border: "1px solid var(--k-border)",
    cursor: "pointer",
    background: active ? "var(--k-text-primary)" : "white",
    color: active ? "white" : "var(--k-text-secondary)",
  });

  const buttonStyle = (primary: boolean) => ({
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 6,
    cursor: busy ? "not-allowed" : "pointer",
    opacity: busy ? 0.6 : 1,
    border: "1px solid var(--k-border)",
    background: primary ? "var(--k-text-primary)" : "white",
    color: primary ? "white" : "var(--k-text-primary)",
  });

  const fieldStyle = {
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "8px 10px",
    fontSize: 14,
    border: "1px solid var(--k-border)",
    borderRadius: 6,
    fontFamily: "inherit",
    color: "var(--k-text-primary)",
    background: "white",
  };

  return (
    <>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "var(--k-surface)",
          width: selected ? 360 : undefined,
          minWidth: selected ? 360 : undefined,
          flex: selected ? undefined : 1,
          borderRight: selected ? "1px solid var(--k-border)" : undefined,
          flexShrink: 0,
        }}
      >
        <div style={{ borderBottom: "1px solid var(--k-border)", background: "white", padding: "16px 24px", flexShrink: 0 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--k-text-primary)", letterSpacing: "-0.01em", fontFamily: "var(--k-font-display)", margin: 0 }}>
            {t("knowledgeView.title")}
          </h1>
          <p style={{ marginTop: 2, fontSize: 13, color: "var(--k-text-tertiary)" }}>{t("knowledgeView.subtitle")}</p>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" style={tabStyle(filter === "draft")} onClick={() => { setFilter("draft"); setSelectedId(null); }}>
              {t("knowledgeView.tabDrafts")}
            </button>
            <button type="button" style={tabStyle(filter === "published")} onClick={() => { setFilter("published"); setSelectedId(null); }}>
              {t("knowledgeView.tabPublished")}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
          {loading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 64 }}>
              <Clock style={{ width: 20, height: 20, color: "var(--k-text-tertiary)" }} className="animate-spin" />
            </div>
          )}

          {!loading && visible.length === 0 && (
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 80, textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "var(--k-text-tertiary)" }}>
                {t(filter === "draft" ? "knowledgeView.emptyDrafts" : "knowledgeView.emptyPublished")}
              </p>
            </div>
          )}

          {!loading &&
            visible.map((article) => (
              <button
                key={article.id}
                type="button"
                onClick={() => open(article)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "12px 24px",
                  border: "none",
                  borderBottom: "1px solid var(--k-border)",
                  cursor: "pointer",
                  background: selectedId === article.id ? "var(--k-bg)" : "transparent",
                }}
              >
                <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: "var(--k-text-primary)" }}>{article.title}</span>
                <span style={{ display: "block", marginTop: 2, fontSize: 12, color: "var(--k-text-tertiary)" }}>
                  {(article.tags ?? []).includes(AI_DRAFT_TAG) ? t("knowledgeView.aiDraft") : t("knowledgeView.manual")}
                </span>
              </button>
            ))}
        </div>
      </div>

      {selected && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflowY: "auto", background: "var(--k-surface)", padding: 24, gap: 12 }}>
          <label style={{ fontSize: 12, color: "var(--k-text-tertiary)" }}>
            {t("knowledgeView.fieldTitle")}
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...fieldStyle, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12, color: "var(--k-text-tertiary)", display: "flex", flexDirection: "column", flex: 1 }}>
            {t("knowledgeView.fieldContent")}
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{ ...fieldStyle, marginTop: 4, flex: 1, minHeight: 320, resize: "vertical" }}
            />
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!selected.is_published && (
              <button type="button" disabled={busy} style={buttonStyle(true)} onClick={() => void save(selected, true)}>
                {t("knowledgeView.publish")}
              </button>
            )}
            <button type="button" disabled={busy} style={buttonStyle(false)} onClick={() => void save(selected, false)}>
              {t("knowledgeView.save")}
            </button>
            <button type="button" disabled={busy} style={buttonStyle(false)} onClick={() => void discard(selected)}>
              {selected.is_published ? t("knowledgeView.delete") : t("knowledgeView.discard")}
            </button>
            {error && <span style={{ fontSize: 13, color: "var(--k-danger, #b42318)" }}>{t("knowledgeView.error")}</span>}
          </div>
        </div>
      )}
    </>
  );
}
