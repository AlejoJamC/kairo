import { Mail, Sparkles } from "lucide-react";
import { ReplyBar } from "./reply-bar";
import { TicketHeader } from "./ticket-header";
import { useTriageStore } from "@/stores/triage-store";

// ---------------------------------------------------------------------------
// TicketDetail
// ---------------------------------------------------------------------------

export function TicketDetail() {
  const { tickets, selectedTicketId } = useTriageStore();
  const ticket = tickets.find((t) => t.id === selectedTicketId) ?? null;

  if (!ticket) {
    return (
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--k-surface)",
          gap: 8,
        }}
      >
        <Mail style={{ width: 40, height: 40, color: "var(--k-border)" }} />
        <p style={{ fontSize: 13, color: "var(--k-text-tertiary)" }}>
          Select a ticket to view details
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--k-surface)",
      }}
    >
      <TicketHeader ticket={ticket} />

      {/* Scrollable body */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "20px 28px",
        }}
      >
        {/* AI annotation row — only when classified */}
        {ticket.ai_reasoning && (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              marginBottom: 16,
              padding: "8px 10px",
              background: "var(--k-accent-subtle)",
              borderRadius: 6,
              border: "1px solid #DBE3FF",
            }}
          >
            <Sparkles
              style={{ width: 13, height: 13, color: "var(--k-accent)", flexShrink: 0, marginTop: 1 }}
            />
            <div
              style={{ fontSize: 12, color: "var(--k-text-secondary)", flex: 1, lineHeight: 1.5 }}
            >
              <span style={{ color: "var(--k-accent)", fontWeight: 500 }}>
                Triage Intelligence
              </span>{" "}
              {ticket.ai_reasoning}
            </div>
          </div>
        )}

        {/* Email body card */}
        <div
          style={{
            background: "white",
            border: "1px solid var(--k-border)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "18px 16px 22px",
              fontSize: 14,
              color: "var(--k-text-primary)",
              lineHeight: 1.65,
            }}
          >
            {ticket.body_plain ? (
              <pre
                style={{
                  fontFamily: "inherit",
                  fontSize: 14,
                  lineHeight: 1.65,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  overflowX: "hidden",
                  color: "var(--k-text-primary)",
                  margin: 0,
                }}
              >
                {ticket.body_plain}
              </pre>
            ) : ticket.snippet ? (
              <p style={{ margin: 0, lineHeight: 1.65 }}>{ticket.snippet}</p>
            ) : (
              <p
                style={{
                  margin: 0,
                  fontStyle: "italic",
                  color: "var(--k-text-tertiary)",
                }}
              >
                No email body available.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Fixed bottom reply bar */}
      <ReplyBar />
    </div>
  );
}
