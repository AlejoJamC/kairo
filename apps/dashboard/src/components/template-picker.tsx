import * as React from "react";
import { useTranslation } from "react-i18next";
import { listTemplates } from "@kairo/client-core/endpoints";
import { Box, Icon, PlainInput, Popover, PopoverContent, PopoverTrigger, Pressable, Text } from "@kairo/ui";

interface Template {
  id: string;
  title: string;
  content: string;
  category: string | null;
}

/** Variables used for client-side preview substitution (KAI-115 Templates 2.0). */
export interface TemplatePreviewVars {
  "cliente.nombre"?: string;
  "cliente.email"?: string;
  "ticket.id"?: string;
  "ticket.asunto"?: string;
  "agente.email"?: string;
}

interface TemplatePickerProps {
  onSelect: (content: string) => void;
  children: React.ReactElement<Record<string, unknown>>;
  /** When provided, variables in preview are substituted with real values. */
  previewVars?: TemplatePreviewVars;
}

/** Replace {{key}} placeholders in a string using a partial variable map. */
function applyVars(content: string, vars?: TemplatePreviewVars): string {
  if (!vars) return content;
  return content.replace(/\{\{([^}]+)\}\}/g, (match, key: string) => {
    const k = key.trim().toLowerCase() as keyof TemplatePreviewVars;
    return vars[k] ?? match;
  });
}

/** Returns true if content has any unresolved {{...}} placeholders. */
function hasUnresolvedVars(content: string, vars?: TemplatePreviewVars): boolean {
  const resolved = applyVars(content, vars);
  return /\{\{[^}]+\}\}/.test(resolved);
}

const DUMMY_TEMPLATE_ID = "__dummy-formal-greeting-template";

export function TemplatePicker({ onSelect, children, previewVars }: TemplatePickerProps) {
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
      const res = await listTemplates(i18n.language);
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
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger>{children}</PopoverTrigger>
      <PopoverContent label={t("templatePicker.searchPlaceholder")} side="top" align="end" width={320}>
          {/* Search bar */}
          <Box display="flex" alignItems="center" gap={8} borderBottomWidth={1} borderBottomColor="var(--k-border-subtle)" paddingVertical={8} paddingHorizontal={12} borderStyle="solid">
            <Icon name="search" size={13} color="var(--k-text-tertiary)" />
            <PlainInput placeholder={t("templatePicker.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} flexGrow={1} flexShrink={1} flexBasis="0%" fontSize={13} color="var(--k-text-primary)" outlineWidth={0} backgroundColor="transparent" borderWidth={0} />
          </Box>

          {/* Body */}
          <Box display="flex" maxHeight="18rem">
            {/* List */}
            <Box onMouseLeave={() => setHoveredId(null)} minWidth={0} flexGrow={1} flexShrink={1} flexBasis="0%" scroll paddingVertical={4} paddingHorizontal={0}>
              {loading && (
                <Text tag="p" paddingVertical={16} paddingHorizontal={12} textAlign="center" fontSize={12} color="var(--k-text-tertiary)" display="block">
                  {t("templatePicker.loading")}
                </Text>
              )}
              {error && (
                <Text tag="p" paddingVertical={16} paddingHorizontal={12} textAlign="center" fontSize={12} color="var(--kairo-color-bad)" display="block">{error}</Text>
              )}
              {!loading && !error && Object.keys(grouped).length === 0 && (
                <Text tag="p" paddingVertical={16} paddingHorizontal={12} textAlign="center" fontSize={12} color="var(--k-text-tertiary)" display="block">
                  {t("templatePicker.empty")}
                </Text>
              )}
              {!loading &&
                !error &&
                Object.entries(grouped).map(([category, items]) => (
                  <div key={category}>
                    <Text tag="p" paddingTop={8} paddingHorizontal={12} paddingBottom={2} fontSize={10} fontWeight={600} textTransform="uppercase" letterSpacing={0.6} color="var(--k-text-tertiary)" display="block">
                      {category}
                    </Text>
                    {items.map((tmpl) => (
                      <Pressable key={tmpl.id} type="button" onMouseEnter={() => setHoveredId(tmpl.id)} onClick={() => {
                          onSelect(tmpl.content);
                          setOpen(false);
                        }} width="100%" paddingVertical={6} paddingHorizontal={12} textAlign="left" fontSize={13} color="var(--k-text-primary)" backgroundColor={hoveredId === tmpl.id ? "var(--k-surface)" : "none"} borderWidth={0} cursor="pointer" outlineWidth={0}>
                        {tmpl.title}
                      </Pressable>
                    ))}
                  </div>
                ))}
            </Box>

            {/* Fixed preview panel */}
            <Box width={176} flexShrink={0} scroll borderLeftWidth={1} borderLeftColor="var(--k-border-subtle)" backgroundColor="var(--k-surface)" padding={12} borderStyle="solid">
              <Text tag="p" marginBottom={4} fontSize={10} fontWeight={600} textTransform="uppercase" letterSpacing={0.6} color="var(--k-text-tertiary)" display="block">
                {t("templatePicker.preview")}
              </Text>
              {hovered ? (
                <>
                  <Text tag="p" whiteSpace="pre-wrap" fontSize={11} lineHeight={17.05} color="var(--k-text-secondary)" display="block">
                    {applyVars(hovered.content, previewVars)}
                  </Text>
                  {hasUnresolvedVars(hovered.content, previewVars) && (
                    <Text tag="p" marginTop={8} fontSize={10} color="var(--k-text-tertiary)" fontStyle="italic" display="block">
                      {t("templatePicker.varsNote", "Variables restantes se reemplazarán al enviar")}
                    </Text>
                  )}
                </>
              ) : (
                <Text tag="p" fontSize={11} color="var(--k-text-tertiary)" display="block">{t("templatePicker.previewEmpty")}</Text>
              )}
            </Box>
          </Box>

      </PopoverContent>
    </Popover>
  );
}
