import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@kairo/client-core/auth";
import { listChannels, deleteChannel, startGmailConnect } from "@kairo/client-core/endpoints";
import type { AppView } from "@/types";
import { Box, Callout, Icon, Pressable, Spinner, Text } from "@kairo/ui";

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
    <Box flexGrow={1} flexShrink={1} flexBasis="0%" scroll backgroundColor="var(--k-bg)" paddingVertical={32} paddingHorizontal={40}>
      {/* Header */}
      <Box display="flex" alignItems="center" gap={12} marginBottom={28}>
        <Pressable onClick={() => onViewChange("settings")} backgroundColor="transparent" borderWidth={0} cursor="pointer" color="var(--k-text-tertiary)" padding={4} borderRadius={6} display="flex">
          <Icon name="back" size={18} />
        </Pressable>
        <div>
          <Text tag="h1" fontSize={18} fontWeight={600} margin={0} color="var(--k-text-primary)" display="block">
            Support Channels
          </Text>
          <Text tag="p" fontSize={13} color="var(--k-text-tertiary)" marginTop={4} marginHorizontal={0} marginBottom={0} display="block">
            Email inboxes connected to this account as support channels.
          </Text>
        </div>
      </Box>

      {/* Error */}
      {error && (
        <Box marginBottom={20}>
          <Callout tone="error" icon={<Icon name="alert" size={15} color="var(--kairo-color-bad)" />}>{error}</Callout>
        </Box>
      )}

      {/* Channel list */}
      <Box backgroundColor="var(--k-surface)" borderWidth={1} borderColor="var(--k-border)" borderRadius={10} overflow="hidden" marginBottom={20} borderStyle="solid">
        {loading ? (
          <Box display="flex" justifyContent="center" padding={32}>
            <Spinner size="lg" />
          </Box>
        ) : channels.length === 0 ? (
          <Text tag="div" padding={32} textAlign="center" display="block">
            <Icon name="mail" size={28} color="var(--k-text-tertiary)" marginBottom={8} />
            <Text tag="p" fontSize={14} color="var(--k-text-secondary)" margin={0} display="block">
              No channels connected yet.
            </Text>
            <Text tag="p" fontSize={13} color="var(--k-text-tertiary)" marginTop={4} marginHorizontal={0} marginBottom={0} display="block">
              Connect a Gmail inbox to start receiving support tickets.
            </Text>
          </Text>
        ) : (
          channels.map((ch, i) => (
            <Box key={ch.id} display="flex" alignItems="center" gap={12} paddingVertical={14} paddingHorizontal={18} borderBottomWidth={i < channels.length - 1 ? 1 : 0} borderBottomColor="var(--k-border)" borderStyle="solid">
              <Icon name="mail" size={16} color="var(--k-text-tertiary)" />
              <Box flexGrow={1} flexShrink={1} flexBasis="0%">
                <Box display="flex" alignItems="center" gap={6}>
                  <Text fontSize={14} fontWeight={500} color="var(--k-text-primary)">
                    {ch.email_address}
                  </Text>
                  {ch.is_primary && (
                    <Text display="flex" alignItems="center" gap={3} fontSize={11} color="var(--kairo-color-warn)" fontWeight={500}>
                      <Icon name="star" size={10} color="var(--kairo-color-warn)" fill="var(--kairo-color-warn)" /> Primary
                    </Text>
                  )}
                </Box>
                <Text tag="p" fontSize={12} color="var(--k-text-tertiary)" marginTop={2} marginHorizontal={0} marginBottom={0} textTransform="capitalize" display="block">
                  {ch.channel_type} · Connected {new Date(ch.connected_at).toLocaleDateString()}
                </Text>
              </Box>
              <Pressable onClick={() => handleDisconnect(ch.id)} disabled={disconnecting === ch.id} title="Disconnect channel" backgroundColor="transparent" borderWidth={0} cursor={disconnecting === ch.id ? "not-allowed" : "pointer"} color="var(--k-text-tertiary)" padding={6} borderRadius={6} display="flex" opacity={disconnecting === ch.id ? 0.5 : 1}>
                {disconnecting === ch.id
                  ? <Spinner />
                  : <Icon name="trash" size={14} />
                }
              </Pressable>
            </Box>
          ))
        )}
      </Box>

      {/* Connect Gmail button */}
      <Pressable onClick={handleConnectGmail} display="flex" alignItems="center" gap={8} paddingVertical={10} paddingHorizontal={16} borderRadius={8} borderWidth={1} borderColor="var(--k-border)" backgroundColor="var(--k-surface)" cursor="pointer" fontSize={14} fontWeight={500} color="var(--k-text-primary)" borderStyle="solid">
        <Icon name="plus" size={16} />
        Connect Gmail inbox
      </Pressable>

      <Text tag="p" fontSize={12} color="var(--k-text-tertiary)" marginTop={12} display="block">
        Outlook, IMAP, and custom channels coming soon.
      </Text>
    </Box>
  );
}
