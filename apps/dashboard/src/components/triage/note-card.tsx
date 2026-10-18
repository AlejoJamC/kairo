import { useTranslation } from "react-i18next";
import { Box, NoteCard as NoteCardView } from "@kairo/ui";
import { NoteBody } from "./note-body";
import type { ThreadMessage } from "@kairo/client-core/hooks/use-ticket-thread";

// A single internal note in the Notes tab. The whole card is the jump target:
// pressing it scrolls the center thread to this note (cross-panel signal).

interface NoteCardProps {
  note: ThreadMessage;
  onJump: (messageId: string) => void;
}

export function NoteCard({ note, onJump }: NoteCardProps) {
  const { t, i18n } = useTranslation("dashboard");
  const unread = note.mention_unread === true;

  const author = note.is_own_note
    ? t("notes.you", "You")
    : note.sender_display_name ?? note.sender_external_id ?? t("ticketDetail.agent", "Agent");

  return (
    <Box marginBottom={8}>
      <NoteCardView
        author={author}
        authorName={note.sender_display_name}
        authorEmail={note.sender_external_id}
        seed={note.author_id ?? note.sender_external_id}
        time={note.received_at ? new Date(note.received_at).toLocaleString(i18n.language) : undefined}
        unread={unread}
        mentionedYouLabel={t("notes.mentionedYou", "MENTIONED YOU")}
        hint={t("notes.jump", "View in thread")}
        title={t("notes.jump", "View in thread")}
        onPress={() => onJump(note.id)}
      >
        <NoteBody body={note.body_plain ?? note.snippet ?? null} mentions={note.mentions} fontSize={12.5} lineHeightRatio={1.55} />
      </NoteCardView>
    </Box>
  );
}
