import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@kairo/client-core/auth";
import { listChannels, deleteChannel, startGmailConnect } from "@kairo/client-core/endpoints";
import type { AppView } from "@/types";
import { Icon, Spinner } from "@kairo/ui";

interface SupportChannel {
  id: string;
  channel_type: string;
  email_address: string;
  display_name: string | null;
  is_primary: boolean;
  is_active: boolean;
  connected_at: string;
}

interface Props {
  onViewChange: (view: AppView) => void;
}

export function ChannelsSettings({ onViewChange }: Props) {
  const { accountId } = useAuth();
  const [channels, setChannels] = useState<SupportChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const fetchChannels = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listChannels(accountId);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setChannels((data.channels ?? []).filter((c: SupportChannel) => c.is_active));
    } catch {
      setError("Could not load channels.");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  const handleDisconnect = async (channelId: string) => {
    if (!accountId) return;
    setDisconnecting(channelId);
    try {
      await deleteChannel(accountId, channelId);
      setChannels((prev) => prev.filter((c) => c.id !== channelId));
    } catch {
      setError("Failed to disconnect channel.");
    } finally {
      setDisconnecting(null);
    }
  };

  const handleConnectGmail = () => {
    // Redirect to the existing Gmail OAuth flow in the landing app.
    startGmailConnect();
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--k-bg)", padding: "32px 40px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <button
          onClick={() => onViewChange("settings")}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--k-text-tertiary)", padding: 4, borderRadius: 6, display: "flex" }}
        >
          <Icon name="back" size={18} />
        </button>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: "var(--k-text-primary)" }}>
            Support Channels
          </h1>
          <p style={{ fontSize: 13, color: "var(--k-text-tertiary)", margin: "4px 0 0" }}>
            Email inboxes connected to this account as support channels.
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", background: "var(--kairo-color-bad-soft)", border: "1px solid var(--kairo-color-bad-line)", borderRadius: 8, padding: "10px 14px", marginBottom: 20 }}>
          <Icon name="alert" size={15} color="var(--kairo-color-bad)" />
          <p style={{ fontSize: 13, color: "var(--kairo-color-bad-ink)", margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Channel list */}
      <div style={{ background: "var(--k-surface)", border: "1px solid var(--k-border)", borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
            <Spinner size="lg" />
          </div>
        ) : channels.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <Icon name="mail" size={28} color="var(--k-text-tertiary)" style={{ marginBottom: 8 }} />
            <p style={{ fontSize: 14, color: "var(--k-text-secondary)", margin: 0 }}>
              No channels connected yet.
            </p>
            <p style={{ fontSize: 13, color: "var(--k-text-tertiary)", margin: "4px 0 0" }}>
              Connect a Gmail inbox to start receiving support tickets.
            </p>
          </div>
        ) : (
          channels.map((ch, i) => (
            <div
              key={ch.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 18px",
                borderBottom: i < channels.length - 1 ? "1px solid var(--k-border)" : "none",
              }}
            >
              <Icon name="mail" size={16} color="var(--k-text-tertiary)" />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: "var(--k-text-primary)" }}>
                    {ch.email_address}
                  </span>
                  {ch.is_primary && (
                    <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--kairo-color-warn)", fontWeight: 500 }}>
                      <Icon name="star" size={10} color="var(--kairo-color-warn)" fill="var(--kairo-color-warn)" /> Primary
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: "var(--k-text-tertiary)", margin: "2px 0 0", textTransform: "capitalize" }}>
                  {ch.channel_type} · Connected {new Date(ch.connected_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => handleDisconnect(ch.id)}
                disabled={disconnecting === ch.id}
                title="Disconnect channel"
                style={{
                  background: "none", border: "none", cursor: disconnecting === ch.id ? "not-allowed" : "pointer",
                  color: "var(--k-text-tertiary)", padding: 6, borderRadius: 6, display: "flex",
                  opacity: disconnecting === ch.id ? 0.5 : 1,
                }}
              >
                {disconnecting === ch.id
                  ? <Spinner />
                  : <Icon name="trash" size={14} />
                }
              </button>
            </div>
          ))
        )}
      </div>

      {/* Connect Gmail button */}
      <button
        onClick={handleConnectGmail}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 16px", borderRadius: 8,
          border: "1px solid var(--k-border)", background: "var(--k-surface)",
          cursor: "pointer", fontSize: 14, fontWeight: 500, color: "var(--k-text-primary)",
        }}
      >
        <Icon name="plus" size={16} />
        Connect Gmail inbox
      </button>

      <p style={{ fontSize: 12, color: "var(--k-text-tertiary)", marginTop: 12 }}>
        Outlook, IMAP, and custom channels coming soon.
      </p>
    </div>
  );
}
