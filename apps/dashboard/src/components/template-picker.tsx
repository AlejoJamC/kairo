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
      const res = await apiCall("/v1/templates", {
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
          className="z-50 w-80 rounded-lg border border-zinc-200 bg-white shadow-lg outline-none animate-in fade-in-0 zoom-in-95"
        >
          {/* Search bar */}
          <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <input
              className="flex-1 text-sm text-zinc-700 outline-none placeholder:text-zinc-400"
              placeholder={t("templatePicker.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          {/* Body */}
          <div className="flex" style={{ maxHeight: "18rem" }}>
            {/* List */}
            <div
              className="min-w-0 flex-1 overflow-y-auto py-1"
              onMouseLeave={() => setHoveredId(null)}
            >
              {loading && (
                <p className="px-3 py-4 text-center text-xs text-zinc-400">
                  {t("templatePicker.loading")}
                </p>
              )}
              {error && (
                <p className="px-3 py-4 text-center text-xs text-red-500">{error}</p>
              )}
              {!loading && !error && Object.keys(grouped).length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-zinc-400">
                  {t("templatePicker.empty")}
                </p>
              )}
              {!loading &&
                !error &&
                Object.entries(grouped).map(([category, items]) => (
                  <div key={category}>
                    <p className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      {category}
                    </p>
                    {items.map((tmpl) => (
                      <button
                        key={tmpl.id}
                        type="button"
                        className="w-full px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50 focus:bg-zinc-50 outline-none"
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

            {/* Fixed preview panel to avoid hover flicker from layout shifts */}
            <div className="w-44 shrink-0 overflow-y-auto border-l border-zinc-100 bg-zinc-50 p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                {t("templatePicker.preview")}
              </p>
              {hovered ? (
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-600">
                  {hovered.content}
                </p>
              ) : (
                <p className="text-xs text-zinc-400">{t("templatePicker.previewEmpty")}</p>
              )}
            </div>
          </div>

          <Popover.Arrow className="fill-white" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
