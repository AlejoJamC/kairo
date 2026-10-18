import { useTranslation } from "react-i18next";
import { Avatar, Box, Kbd, Pressable, Skeleton, Text } from "@kairo/ui";
import type { AccountMember } from "@kairo/client-core/hooks/use-account-members";

// ---------------------------------------------------------------------------
// KAI-232 · design spec C2–C6 — the @mention picker, anchored above the note
// composer's text area.
//
// States, all from props so the composer owns the interaction:
//   loading    → skeleton rows on the very first open of the session (C5)
//   no matches → stays open with the quoted query; Enter does nothing (C6)
//   list       → up to 6 rows, keyboard-highlighted, match run underlined (C2–C4)
// ---------------------------------------------------------------------------

interface MentionDropdownProps {
  members: AccountMember[];
  /** Total pool size, for the "n of N" counter — not just the visible slice. */
  totalCount: number;
  query: string;
  activeIndex: number;
  loading: boolean;
  onPick: (member: AccountMember) => void;
  onHover: (index: number) => void;
}

/** Highlights the matched run inside a name (spec C4). */
function highlightMatch(text: string, query: string) {
  if (!query) return text;
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <Text backgroundColor="#DBEAFE" color="var(--k-accent)" borderRadius={2}>
        {text.slice(at, at + query.length)}
      </Text>
      {text.slice(at + query.length)}
    </>
  );
}

export function MentionDropdown({
  members,
  totalCount,
  query,
  activeIndex,
  loading,
  onPick,
  onHover,
}: MentionDropdownProps) {
  const { t } = useTranslation("dashboard");
  const empty = !loading && members.length === 0;

  return (
    <Box data-testid="mention-dropdown" role="listbox" aria-label={t("mention.header", "Mention")} position="absolute" bottom="calc(100% + 6px)" left={0} width={296} maxWidth="100%" backgroundColor="white" borderWidth={1} borderColor="var(--k-border)" borderRadius={10} boxShadow="var(--k-shadow-popover)" overflow="hidden" zIndex={30} borderStyle="solid">
      {/* Header — what this is, what you typed, how much it narrowed */}
      <Box paddingVertical={7} paddingHorizontal={11} borderBottomWidth={1} borderBottomColor="var(--k-border-subtle)" display="flex" alignItems="center" gap={6} backgroundColor="var(--k-surface)" borderStyle="solid">
        <Text font="mono" fontSize={9.5} color="var(--k-text-tertiary)" textTransform="uppercase" letterSpacing={0.57}>
          {t("mention.header", "Mention")}
        </Text>
        {query && (
          <Text font="mono" fontSize={10} color="var(--k-accent)">
            @{query}
          </Text>
        )}
        <Text marginLeft="auto" font="mono" fontSize={9.5} color="var(--k-text-tertiary)">
          {loading ? "…" : t("mention.counter", { shown: members.length, total: totalCount, defaultValue: "{{shown}} of {{total}}" })}
        </Text>
      </Box>

      {loading && (
        <Box padding={6}>
          {[0, 1, 2, 3].map((i) => (
            <Box key={i} display="flex" alignItems="center" gap={9} padding={7}>
              <Skeleton width={24} height={24} borderRadius={999} />
              <Box flexGrow={1} flexShrink={1} flexBasis="0%">
                <Skeleton height={8} width={108 - i * 12} marginBottom={5} />
                <Skeleton height={7} width={62} />
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {empty && (
        <Text tag="div" paddingVertical={26} paddingHorizontal={18} textAlign="center" display="block">
          <Text tag="div" font="mono" fontSize={15} color="var(--k-border)" marginBottom={8} display="block">
            ◌
          </Text>
          <Text tag="div" fontSize={12.5} color="var(--k-text-secondary)" marginBottom={3} display="block">
            {t("mention.empty", "No members found")}
          </Text>
          <Text tag="div" fontSize={11} color="var(--k-text-tertiary)" font="mono" display="block">
            «{query}»
          </Text>
        </Text>
      )}

      {!loading && !empty && (
        <Box padding={4} maxHeight={258} scroll>
          {members.map((member, index) => {
            const active = index === activeIndex;
            const label = member.name ?? member.email ?? member.user_id;
            return (
              <Pressable key={member.user_id} type="button" role="option" aria-selected={active} onMouseDown={(e) => { e.preventDefault(); onPick(member); }} onMouseEnter={() => onHover(index)} display="flex" alignItems="center" gap={9} width="100%" paddingVertical={6} paddingHorizontal={8} borderRadius={6} borderWidth={0} cursor="pointer" textAlign="left" backgroundColor={active ? "var(--k-accent-subtle)" : "transparent"} boxShadow={active ? "inset 2px 0 0 var(--k-accent)" : "none"}>
                <Avatar name={member.name} email={member.email} seed={member.user_id} size={24} />
                <Text minWidth={0} flexGrow={1} flexShrink={1} flexBasis="0%">
                  <Text display="block" fontSize={12.5} fontWeight={500} color="var(--k-text-primary)" lineHeight={15.63} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                    {highlightMatch(label, query)}
                  </Text>
                  <Text display="block" fontSize={10.5} color="var(--k-text-tertiary)" font="mono">
                    {member.role}
                  </Text>
                </Text>
                {active && (
                  <Kbd>↵</Kbd>
                )}
              </Pressable>
            );
          })}
          {!query && totalCount > members.length && (
            <Text tag="div" paddingTop={5} paddingHorizontal={10} paddingBottom={3} font="mono" fontSize={9.5} color="var(--k-text-tertiary)" display="block">
              {t("mention.more", { count: totalCount - members.length, defaultValue: "+{{count}} more · keep typing to filter" })}
            </Text>
          )}
        </Box>
      )}

      {/* Keyboard legend */}
      <Box paddingVertical={6} paddingHorizontal={11} borderTopWidth={1} borderTopColor="var(--k-border-subtle)" backgroundColor="var(--k-surface)" display="flex" gap={10} borderStyle="solid">
        <Text display="flex" alignItems="center" gap={4} fontSize={10} color="var(--k-text-tertiary)">
          <Kbd>↑↓</Kbd>{t("mention.keyNavigate", "navigate")}
        </Text>
        <Text display="flex" alignItems="center" gap={4} fontSize={10} color="var(--k-text-tertiary)">
          <Kbd>↵</Kbd>{t("mention.keyInsert", "insert")}
        </Text>
        <Text display="flex" alignItems="center" gap={4} fontSize={10} color="var(--k-text-tertiary)">
          <Kbd>esc</Kbd>{t("mention.keyClose", "close")}
        </Text>
      </Box>
    </Box>
  );
}
