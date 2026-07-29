import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/ui/avatar";
import type { AccountMember } from "@/hooks/use-account-members";

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
      <span style={{ background: "#DBEAFE", color: "var(--k-accent)", borderRadius: 2 }}>
        {text.slice(at, at + query.length)}
      </span>
      {text.slice(at + query.length)}
    </>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd
      style={{
        fontFamily: "var(--k-font-mono)",
        fontSize: 9,
        padding: "0 4px",
        background: "white",
        border: "1px solid var(--k-border)",
        borderRadius: 3,
      }}
    >
      {children}
    </kbd>
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
    <div
      data-testid="mention-dropdown"
      role="listbox"
      aria-label={t("mention.header", "Mention")}
      style={{
        position: "absolute",
        bottom: "calc(100% + 6px)",
        left: 0,
        width: 296,
        maxWidth: "100%",
        background: "white",
        border: "1px solid var(--k-border)",
        borderRadius: 10,
        boxShadow: "var(--k-shadow-popover)",
        overflow: "hidden",
        zIndex: 30,
      }}
    >
      {/* Header — what this is, what you typed, how much it narrowed */}
      <div
        style={{
          padding: "7px 11px",
          borderBottom: "1px solid var(--k-border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "var(--k-surface)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--k-font-mono)",
            fontSize: 9.5,
            color: "var(--k-text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {t("mention.header", "Mention")}
        </span>
        {query && (
          <span style={{ fontFamily: "var(--k-font-mono)", fontSize: 10, color: "var(--k-accent)" }}>
            @{query}
          </span>
        )}
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--k-font-mono)",
            fontSize: 9.5,
            color: "var(--k-text-tertiary)",
          }}
        >
          {loading ? "…" : t("mention.counter", { shown: members.length, total: totalCount, defaultValue: "{{shown}} of {{total}}" })}
        </span>
      </div>

      {loading && (
        <div style={{ padding: 6 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px" }}>
              <div className="shimmer" style={{ width: 24, height: 24, borderRadius: 999 }} />
              <div style={{ flex: 1 }}>
                <div className="shimmer" style={{ height: 8, width: 108 - i * 12, marginBottom: 5 }} />
                <div className="shimmer" style={{ height: 7, width: 62 }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {empty && (
        <div style={{ padding: "26px 18px", textAlign: "center" }}>
          <div
            style={{
              fontFamily: "var(--k-font-mono)",
              fontSize: 15,
              color: "var(--k-border)",
              marginBottom: 8,
            }}
          >
            ◌
          </div>
          <div style={{ fontSize: 12.5, color: "var(--k-text-secondary)", marginBottom: 3 }}>
            {t("mention.empty", "No members found")}
          </div>
          <div style={{ fontSize: 11, color: "var(--k-text-tertiary)", fontFamily: "var(--k-font-mono)" }}>
            «{query}»
          </div>
        </div>
      )}

      {!loading && !empty && (
        <div style={{ padding: 4, maxHeight: 258, overflowY: "auto" }}>
          {members.map((member, index) => {
            const active = index === activeIndex;
            const label = member.name ?? member.email ?? member.user_id;
            return (
              <button
                key={member.user_id}
                type="button"
                role="option"
                aria-selected={active}
                // onMouseDown, not onClick: the textarea must keep focus so the
                // caret survives the insertion.
                onMouseDown={(e) => { e.preventDefault(); onPick(member); }}
                onMouseEnter={() => onHover(index)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  width: "100%",
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  font: "inherit",
                  background: active ? "var(--k-accent-subtle)" : "transparent",
                  boxShadow: active ? "inset 2px 0 0 var(--k-accent)" : "none",
                }}
              >
                <Avatar name={member.name} email={member.email} seed={member.user_id} size={24} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: "var(--k-text-primary)",
                      lineHeight: 1.25,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {highlightMatch(label, query)}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 10.5,
                      color: "var(--k-text-tertiary)",
                      fontFamily: "var(--k-font-mono)",
                    }}
                  >
                    {member.role}
                  </span>
                </span>
                {active && (
                  <kbd
                    style={{
                      fontFamily: "var(--k-font-mono)",
                      fontSize: 9.5,
                      padding: "1px 5px",
                      background: "white",
                      border: "1px solid var(--k-mention-border)",
                      borderRadius: 3,
                      color: "var(--k-accent)",
                    }}
                  >
                    ↵
                  </kbd>
                )}
              </button>
            );
          })}
          {!query && totalCount > members.length && (
            <div
              style={{
                padding: "5px 10px 3px",
                fontFamily: "var(--k-font-mono)",
                fontSize: 9.5,
                color: "var(--k-text-tertiary)",
              }}
            >
              {t("mention.more", { count: totalCount - members.length, defaultValue: "+{{count}} more · keep typing to filter" })}
            </div>
          )}
        </div>
      )}

      {/* Keyboard legend */}
      <div
        style={{
          padding: "6px 11px",
          borderTop: "1px solid var(--k-border-subtle)",
          background: "var(--k-surface)",
          display: "flex",
          gap: 10,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--k-text-tertiary)" }}>
          <Kbd>↑↓</Kbd>{t("mention.keyNavigate", "navigate")}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--k-text-tertiary)" }}>
          <Kbd>↵</Kbd>{t("mention.keyInsert", "insert")}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--k-text-tertiary)" }}>
          <Kbd>esc</Kbd>{t("mention.keyClose", "close")}
        </span>
      </div>
    </div>
  );
}
