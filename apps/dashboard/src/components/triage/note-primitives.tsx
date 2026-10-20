import { useTranslation } from "react-i18next";
import { Box, Button, Chip, Icon, Skeleton, Text } from "@kairo/ui";

// ---------------------------------------------------------------------------
// KAI-232 — small shared pieces of the internal-notes surface. Kept here (not
// inlined per screen) because the composer, the thread, the Notes tab and the
// bell all reuse them, and the amber grammar must stay identical across the
// four. All colors come from the --k-note-* / --k-mention-* tokens.
// ---------------------------------------------------------------------------

/** "TEAM ONLY" — the permanent reminder that a note never reaches the customer. */
export function TeamOnlyChip({ size = "md" }: { size?: "sm" | "md" }) {
  const { t } = useTranslation("dashboard");
  return (
    <Chip tone="note" mono size={size} icon={<Icon name="lock" size={size === "sm" ? 9 : 10} />}>
      {t("notes.teamOnly", "TEAM ONLY")}
    </Chip>
  );
}

/** Header of the Notes tab: count + the primary "new note" action. */
export function NotesHeader({ count, onNewNote }: { count: number; onNewNote?: () => void }) {
  const { t } = useTranslation("dashboard");
  return (
    <Box display="flex" alignItems="center" gap={8} marginBottom={10}>
      <Text font="mono" fontSize={10.5} color="var(--k-text-tertiary)" textTransform="uppercase" letterSpacing={0.53}>
        {t("notes.count", { count, defaultValue: "{{count}} notes · this ticket" })}
      </Text>
      {onNewNote && (
        <Box marginLeft="auto">
          <Button size="sm" icon={<Icon name="plus" size={11} />} onPress={onNewNote}>
            {t("notes.new", "New note")}
          </Button>
        </Box>
      )}
    </Box>
  );
}

/** Always-visible privacy note — deliberately not a tooltip (design spec B1). */
export function PrivacyFootnote() {
  const { t } = useTranslation("dashboard");
  return (
    <Box display="flex" alignItems="flex-start" gap={6} marginTop={4} paddingVertical={8} paddingHorizontal={10} borderRadius={6} backgroundColor="var(--k-surface)" borderWidth={1} borderColor="var(--k-border-subtle)" borderStyle="solid">
      <Icon name="lock" size={11} color="var(--k-text-tertiary)" marginTop={2} />
      <Text fontSize={11} color="var(--k-text-tertiary)" lineHeight={15.95}>
        {t("notes.privacy", "Internal notes are never sent to or visible by the customer.")}
      </Text>
    </Box>
  );
}

/** Loading placeholder with the real card's amber outline and metrics. */
export function NoteSkeleton() {
  return (
    <Box paddingVertical={10} paddingHorizontal={12} borderRadius={8} marginBottom={8} backgroundColor="var(--k-note-bg)" borderWidth={1} borderColor="var(--k-note-border)" borderStyle="solid">
      <Box display="flex" alignItems="center" gap={7} marginBottom={8}>
        <Skeleton width={20} height={20} borderRadius={999} />
        <Skeleton height={9} width={92} />
        <Skeleton height={8} width={34} marginLeft="auto" />
      </Box>
      <Skeleton height={8} width="100%" marginBottom={6} />
      <Skeleton height={8} width="72%" />
    </Box>
  );
}
