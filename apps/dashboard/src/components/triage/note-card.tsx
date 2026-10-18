import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, Box, Icon, Text } from "@kairo/ui";
import { NoteBody } from "./note-body";
import type { ThreadMessage } from "@kairo/client-core/hooks/use-ticket-thread";

// ---------------------------------------------------------------------------
// KAI-232 · design spec B3/B4 — a single internal note in the Notes tab.
//
// Three visual states, all driven by data rather than props the caller has to
// reason about:
//   unread  → this note mentions the viewer and they haven't read it:
//             stronger amber, accent rail, ringed avatar, "MENTIONED YOU", dot
//   hover   → amber hover border, lift, and the "view in thread" affordance
//   default → calm amber
//
// The whole card is the jump target: clicking scrolls the center thread to
// this note (ADR-011 cross-panel signal).
// ---------------------------------------------------------------------------

interface NoteCardProps {
  note: ThreadMessage;
  onJump: (messageId: string) => void;
}

export function NoteCard({ note, onJump }: NoteCardProps) {
  const { t, i18n } = useTranslation("dashboard");
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const unread = note.mention_unread === true;
  // Keyboard focus replicates the hover treatment exactly (spec B3).
  const raised = hovered || focused;

  const authorLabel = note.is_own_note
    ? t("notes.you", "You")
    : note.sender_display_name ?? note.sender_external_id ?? t("ticketDetail.agent", "Agent");

  const borderColor = unread || raised ? "var(--k-note-border-hover)" : "var(--k-note-border)";

  return (
    <Text tag="div" role="button" tabIndex={0} onClick={() => onJump(note.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onJump(note.id); } }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} title={t("notes.jump", "View in thread")} position="relative" display="block" width="100%" textAlign="left" paddingVertical={10} paddingHorizontal={12} borderRadius={8} marginBottom={8} backgroundColor={unread ? "var(--k-note-bg-strong)" : "var(--k-note-bg)"} borderWidth={1} borderStyle="solid" borderColor={borderColor} borderLeftWidth={unread ? 2 : 1} borderLeftColor={unread ? "var(--k-mention-solid)" : borderColor} boxShadow={raised ? "0 2px 8px rgba(146,64,14,0.10)" : "none"} transform={raised ? "translateY(-1px)" : "none"} cursor="pointer" transition="all .12s ease">
      <Box display="flex" alignItems="center" gap={7} marginBottom={6}>
        <Avatar
          name={note.sender_display_name}
          email={note.sender_external_id}
          seed={note.author_id ?? note.sender_external_id}
          size={20}
          ring={unread}
        />
        <Text fontSize={12.5} fontWeight={unread ? 600 : 500} color="var(--k-note-text-strong)">
          {authorLabel}
        </Text>
        {unread && (
          <Text display="inline-flex" alignItems="center" paddingVertical={1} paddingHorizontal={5} borderRadius={3} backgroundColor="var(--k-mention-solid)" color="white" font="mono" fontSize={9} fontWeight={600} letterSpacing={0.36}>
            {t("notes.mentionedYou", "MENTIONED YOU")}
          </Text>
        )}
        <Text marginLeft="auto" display="flex" alignItems="center" gap={6}>
          <Text font="mono" fontSize={10} color={unread ? "var(--k-note-label)" : "#B98A3E"}>
            {note.received_at ? new Date(note.received_at).toLocaleString(i18n.language) : ""}
          </Text>
          {unread && (
            <Text width={6} height={6} borderRadius={999} backgroundColor="var(--k-mention-solid)" flexShrink={0} />
          )}
        </Text>
      </Box>

      <NoteBody
        body={note.body_plain ?? note.snippet ?? null}
        mentions={note.mentions}
        fontSize={12.5} lineHeightRatio={1.55} color={unread ? "var(--k-note-text-strong)" : "var(--k-note-text)"}
      />

      {raised && (
        <Box marginTop={8} paddingTop={7} borderTopWidth={1} borderTopColor="var(--k-note-border)" display="flex" alignItems="center" gap={6} borderStyle="dashed">
          <Text font="mono" fontSize={10} color="var(--k-note-label)" display="flex" alignItems="center" gap={4}>
            <Icon name="arrow" size={10} />
            {t("notes.jump", "View in thread")}
          </Text>
        </Box>
      )}
    </Text>
  );
}
