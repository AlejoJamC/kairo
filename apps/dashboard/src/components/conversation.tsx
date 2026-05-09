import type { Message } from "@/types";

interface ConversationProps {
  messages: Message[];
}

export function Conversation({ messages }: ConversationProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {messages.map((msg, i) => {
        const isCustomer = msg.sender === "customer";
        return (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 12,
              flexDirection: isCustomer ? "row" : "row-reverse",
            }}
          >
            {/* Avatar */}
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                background: isCustomer
                  ? "linear-gradient(135deg, #FCA5A5, #F472B6)"
                  : "linear-gradient(135deg, var(--k-accent), #6E8BFF)",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {isCustomer ? "C" : "A"}
            </div>

            {/* Bubble */}
            <div
              style={{
                maxWidth: "75%",
                borderRadius: 12,
                padding: "14px 16px",
                background: "white",
                border: "1px solid var(--k-border)",
                boxShadow: "0 1px 2px rgba(9,9,11,0.04)",
                marginLeft: isCustomer ? 0 : "auto",
              }}
            >
              <p
                style={{
                  fontSize: 14,
                  color: "var(--k-text-primary)",
                  lineHeight: 1.65,
                  margin: 0,
                }}
              >
                {msg.content}
              </p>
              <p
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  fontFamily: "var(--k-font-mono)",
                  color: "var(--k-text-tertiary)",
                }}
              >
                {msg.timestamp}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
