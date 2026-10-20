import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@kairo/client-core/auth";
import { listChannels, deleteChannel, startGmailConnect } from "@kairo/client-core/endpoints";
import type { AppView } from "@/types";
import { Box, Callout, Icon, IconButton, IntegrationCard, Spinner, Text } from "@kairo/ui";

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
  const { t } = useTranslation("dashboard");
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
      setError(t("channelsSettings.loadError"));
    } finally {
      setLoading(false);
    }
  }, [accountId, t]);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  const handleDisconnect = async (channelId: string) => {
    if (!accountId) return;
    setDisconnecting(channelId);
    try {
      await deleteChannel(accountId, channelId);
      setChannels((prev) => prev.filter((c) => c.id !== channelId));
    } catch {
      setError(t("channelsSettings.disconnectError"));
    } finally {
      setDisconnecting(null);
    }
  };

  // Redirect to the existing Gmail OAuth flow in the landing app.
  const handleConnectGmail = () => startGmailConnect();

  const labels = {
    beta: "BETA",
    soon: t("channelsSettings.soon"),
    connect: t("channelsSettings.connect"),
    connecting: t("channelsSettings.connecting"),
    reconnect: t("channelsSettings.reconnect"),
    // The connected card has no configuration screen: its action is Disconnect.
    configure: t("channelsSettings.disconnect"),
    requestAccess: "",
    requested: "",
  };

  return (
    <Box flexGrow={1} flexShrink={1} flexBasis="0%" scroll backgroundColor="var(--k-bg)" paddingVertical={32} paddingHorizontal={40}>
      <Box display="flex" alignItems="center" gap={12} marginBottom={28}>
        <IconButton label={t("channelsSettings.back")} onPress={() => onViewChange("settings")}>
          <Icon name="back" size={18} color="var(--k-text-tertiary)" />
        </IconButton>
        <Box>
          <Text tag="h1" fontSize={18} fontWeight={600} margin={0} color="var(--k-text-primary)" display="block">
            {t("channelsSettings.title")}
          </Text>
          <Text tag="p" fontSize={13} color="var(--k-text-tertiary)" marginTop={4} marginHorizontal={0} marginBottom={0} display="block">
            {t("channelsSettings.subtitle")}
          </Text>
        </Box>
      </Box>

      {error && (
        <Box marginBottom={20}>
          <Callout tone="error" icon={<Icon name="alert" size={15} color="var(--kairo-color-bad)" />}>{error}</Callout>
        </Box>
      )}

      <Box display="flex" flexDirection="column" gap={10} marginBottom={20}>
        {loading ? (
          <Box display="flex" justifyContent="center" padding={32}>
            <Spinner size="lg" />
          </Box>
        ) : channels.length === 0 ? (
          <Box alignItems="center" padding={32}>
            <Icon name="mail" size={28} color="var(--k-text-tertiary)" marginBottom={8} />
            <Text tag="p" fontSize={14} color="var(--k-text-secondary)" margin={0} display="block">
              {t("channelsSettings.emptyTitle")}
            </Text>
            <Text tag="p" fontSize={13} color="var(--k-text-tertiary)" marginTop={4} marginHorizontal={0} marginBottom={0} display="block">
              {t("channelsSettings.emptyBody")}
            </Text>
          </Box>
        ) : (
          channels.map((ch) => (
            <IntegrationCard
              key={ch.id}
              name={ch.email_address}
              initial={ch.channel_type.slice(0, 1).toUpperCase()}
              tileColor="var(--kairo-color-accent)"
              status={disconnecting === ch.id ? "connecting" : "connected"}
              description={[
                t("channelsSettings.connectedOn", { type: ch.channel_type, date: new Date(ch.connected_at).toLocaleDateString() }),
                ch.is_primary ? t("channelsSettings.primary") : null,
              ].filter(Boolean).join(" · ")}
              labels={labels}
              onConfigure={() => handleDisconnect(ch.id)}
            />
          ))
        )}
        <IntegrationCard
          name={t("channelsSettings.gmailName")}
          initial="G"
          tileColor="var(--kairo-color-accent)"
          status="available"
          description={t("channelsSettings.gmailDescription")}
          labels={labels}
          onConnect={handleConnectGmail}
        />
        <IntegrationCard
          name={t("channelsSettings.outlookName")}
          initial="O"
          tileColor="var(--kairo-color-faint)"
          status="soon"
          description={t("channelsSettings.outlookDescription")}
          labels={labels}
        />
      </Box>
    </Box>
  );
}
