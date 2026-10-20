import { useTranslation } from "react-i18next";
import { parseNoteBody } from "@kairo/client-core/note-mentions";
import type { NoteMention } from "@kairo/client-core/hooks/use-ticket-thread";
import { Text, type TextProps } from "@kairo/ui";

// ---------------------------------------------------------------------------
// KAI-232 — renders an internal-note body with `@[user:<uuid>]` tokens drawn
// as mention chips. Shared by the center thread (ticket-detail) and the
// right-panel Notes tab so both read a note identically.
//
// A mention of the current viewer renders SOLID accent; mentions of others
// render as a calm soft chip (design spec B4). Which is which comes from the
// API's `is_me`, so this component needs no identity of its own.
// ---------------------------------------------------------------------------

type NoteBodyProps = {
  body: string | null;
  mentions?: NoteMention[];
} & Omit<TextProps, "children">; // the surrounding card owns color and sizing

export function NoteBody({ body, mentions = [], ...textProps }: NoteBodyProps) {
  const { t } = useTranslation("dashboard");
  const segments = parseNoteBody(body, mentions);

  if (segments.length === 0) return null;

  const isMeById = new Map(mentions.map((m) => [m.user_id.toLowerCase(), m.is_me === true]));

  return (
    <Text tag="pre" display="block" fontSize={13} lineHeightRatio={1.65} whiteSpace="pre-wrap" wordBreak="break-word" overflowX="hidden" margin={0} {...textProps}>
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return <span key={index}>{segment.value}</span>;
        }
        const isMe = isMeById.get(segment.userId) === true;
        return (
          <Text key={index} title={segment.name ?? undefined} display="inline-flex" alignItems="center" paddingVertical={0.5} paddingHorizontal={5} borderRadius={4} fontSize="0.94em" fontWeight={500} whiteSpace="nowrap" backgroundColor={isMe ? "var(--k-mention-solid)" : "var(--k-mention-bg)"} color={isMe ? "white" : "var(--k-accent)"} borderWidth={1} borderColor={isMe ? "var(--k-mention-solid)" : "var(--k-mention-border)"} borderStyle="solid">
            @{segment.name ?? t("notes.unknownMember", "member")}
          </Text>
        );
      })}
    </Text>
  );
}
