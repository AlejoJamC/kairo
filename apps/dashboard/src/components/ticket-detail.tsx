import { Mail, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ReplyBar } from "./reply-bar";
import { TicketHeader } from "./ticket-header";
import { useTriageStore } from "@/stores/triage-store";

// ---------------------------------------------------------------------------
// Sender avatar (initials circle)
// ---------------------------------------------------------------------------

function SenderAvatar({ name, email }: { name: string | null; email: string | null }) {
  const initials = name
    ? name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")
    : (email?.[0]?.toUpperCase() ?? "?");
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: "var(--k-accent-subtle)",
        border: "1.5px solid #C7D2FE",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 600,
        color: "var(--k-accent)",
        flexShrink: 0,
        letterSpacing: "0.02em",
      }}
    >
      {initials}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TicketDetail
// ---------------------------------------------------------------------------

export function TicketDetail() {
  const { t } = useTranslation("dashboard");
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
          {t("ticketDetail.selectPrompt", "Select a ticket to view details")}
        </p>
      </div>
    );
  }

  const receivedDate = ticket.received_at
    ? new Date(ticket.received_at).toLocaleString()
    : null;

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
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* Subject h1 */}
        <h1
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "var(--k-text-primary)",
            margin: 0,
            lineHeight: 1.3,
            letterSpacing: "-0.02em",
          }}
        >
          {ticket.subject ?? t("ticketDetail.noSubject", "(Sin asunto)")}
        </h1>

        {/* Sender row */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <SenderAvatar name={ticket.from_name} email={ticket.from_email} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--k-text-primary)",
                margin: "0 0 2px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {ticket.from_name ?? ticket.from_email ?? t("ticketDetail.unknownSender", "Unknown sender")}
            </p>
            <p
              style={{
                fontSize: 12,
                color: "var(--k-text-tertiary)",
                margin: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {ticket.from_email && ticket.from_name ? `<${ticket.from_email}>` : ""}
              {receivedDate ? ` · ${receivedDate}` : ""}
            </p>
          </div>
        </div>

        {/* AI reasoning banner */}
        {ticket.ai_reasoning && (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              padding: "8px 10px",
              background: "var(--k-accent-subtle)",
              borderRadius: 6,
              border: "1px solid #DBE3FF",
            }}
          >
            <Sparkles
              style={{ width: 13, height: 13, color: "var(--k-accent)", flexShrink: 0, marginTop: 1 }}
            />
            <div style={{ fontSize: 12, color: "var(--k-text-secondary)", flex: 1, lineHeight: 1.5 }}>
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
              padding: "18px 20px 22px",
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
                {t("ticketDetail.noBody", "No email body available.")}
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
