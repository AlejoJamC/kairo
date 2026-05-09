import * as React from "react";
import { Search } from "lucide-react";
import { Popover } from "radix-ui";
import { useTranslation } from "react-i18next";
import { apiCall } from "@/lib/api-client";

interface Template {
  id: string;
  title: string;
  content: string;
  category: string | null;
}

interface TemplatePickerProps {
  onSelect: (content: string) => void;
  children: React.ReactNode;
}

const DUMMY_TEMPLATE_ID = "__dummy-formal-greeting-template";

export function TemplatePicker({ onSelect, children }: TemplatePickerProps) {
  const { t, i18n } = useTranslation("dashboard");
  const [open, setOpen] = React.useState(false);
  const [templates, setTemplates] = React.useState<Template[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  const dummyTemplate = React.useMemo<Template>(
    () => ({
      id: DUMMY_TEMPLATE_ID,
      title: t("templatePicker.dummyFormalGreetingTitle"),
      content: t("templatePicker.dummyFormalGreetingContent"),
      category: t("templatePicker.uncategorized"),
    }),
    [t]
  );

  function withDummyFirst(items: Template[]): Template[] {
    const nonDummyItems = items.filter((item) => item.id !== DUMMY_TEMPLATE_ID);
    return [dummyTemplate, ...nonDummyItems];
  }

  async function fetchTemplates() {
    if (templates.length > 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiCall("/api/v1/templates", {
        headers: { "Accept-Language": i18n.language },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: Template[] };
      setTemplates(withDummyFirst(json.data ?? []));
    } catch (err) {
      console.warn("[TemplatePicker] fetch failed, using dummy template", err);
      setTemplates(withDummyFirst([]));
      setError(null);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) fetchTemplates();
    if (!next) setSearch("");
  }

  const filtered = templates.filter((tmpl) =>
    tmpl.title.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce<Record<string, Template[]>>((acc, tmpl) => {
    const key = tmpl.category ?? t("templatePicker.uncategorized");
    (acc[key] ??= []).push(tmpl);
    return acc;
  }, {});

  const hovered = templates.find((tmpl) => tmpl.id === hoveredId);

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={8}
          style={{
            zIndex: 50,
            width: 320,
            borderRadius: 10,
            border: "1px solid var(--k-border)",
            background: "white",
            boxShadow: "0 4px 16px rgba(9,9,11,0.08), 0 1px 2px rgba(9,9,11,0.04)",
            outline: "none",
          }}
          className="animate-in fade-in-0 zoom-in-95"
        >
          {/* Search bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--k-border-subtle)", padding: "8px 12px" }}>
            <Search style={{ width: 13, height: 13, flexShrink: 0, color: "var(--k-text-tertiary)" }} />
            <input
              style={{ flex: 1, fontSize: 13, color: "var(--k-text-primary)", outline: "none", background: "none", border: "none" }}
              placeholder={t("templatePicker.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          {/* Body */}
          <div style={{ display: "flex", maxHeight: "18rem" }}>
            {/* List */}
            <div
              style={{ minWidth: 0, flex: 1, overflowY: "auto", padding: "4px 0" }}
              onMouseLeave={() => setHoveredId(null)}
            >
              {loading && (
                <p style={{ padding: "16px 12px", textAlign: "center", fontSize: 12, color: "var(--k-text-tertiary)" }}>
                  {t("templatePicker.loading")}
                </p>
              )}
              {error && (
                <p style={{ padding: "16px 12px", textAlign: "center", fontSize: 12, color: "#EF4444" }}>{error}</p>
              )}
              {!loading && !error && Object.keys(grouped).length === 0 && (
                <p style={{ padding: "16px 12px", textAlign: "center", fontSize: 12, color: "var(--k-text-tertiary)" }}>
                  {t("templatePicker.empty")}
                </p>
              )}
              {!loading &&
                !error &&
                Object.entries(grouped).map(([category, items]) => (
                  <div key={category}>
                    <p style={{ padding: "8px 12px 2px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--k-text-tertiary)" }}>
                      {category}
                    </p>
                    {items.map((tmpl) => (
                      <button
                        key={tmpl.id}
                        type="button"
                        style={{
                          width: "100%",
                          padding: "6px 12px",
                          textAlign: "left",
                          fontSize: 13,
                          color: "var(--k-text-primary)",
                          background: hoveredId === tmpl.id ? "var(--k-surface)" : "none",
                          border: "none",
                          cursor: "pointer",
                          outline: "none",
                        }}
                        onMouseEnter={() => setHoveredId(tmpl.id)}
                        onClick={() => {
                          onSelect(tmpl.content);
                          setOpen(false);
                        }}
                      >
                        {tmpl.title}
                      </button>
                    ))}
                  </div>
                ))}
            </div>

            {/* Fixed preview panel */}
            <div style={{ width: 176, flexShrink: 0, overflowY: "auto", borderLeft: "1px solid var(--k-border-subtle)", background: "var(--k-surface)", padding: 12 }}>
              <p style={{ marginBottom: 4, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--k-text-tertiary)" }}>
                {t("templatePicker.preview")}
              </p>
              {hovered ? (
                <p style={{ whiteSpace: "pre-wrap", fontSize: 11, lineHeight: 1.55, color: "var(--k-text-secondary)" }}>
                  {hovered.content}
                </p>
              ) : (
                <p style={{ fontSize: 11, color: "var(--k-text-tertiary)" }}>{t("templatePicker.previewEmpty")}</p>
              )}
            </div>
          </div>

          <Popover.Arrow style={{ fill: "white" }} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
