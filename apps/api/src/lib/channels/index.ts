// ChannelSender registry (KAI-114 / ADR-023 §2)
//
// Single seam for resolving a channel-agnostic sender from a provider name.
// New channels (Instagram, WhatsApp, Slack — KAI-115+) register here and
// nowhere else needs to change.

import { GmailChannelSender } from "./gmail.js";
import type { ChannelSender } from "./types.js";

const senders: Record<string, ChannelSender> = {
  gmail: new GmailChannelSender(),
};

export function getChannelSender(provider: string): ChannelSender {
  const sender = senders[provider];
  if (!sender) {
    throw new Error(`[channel-sender] no ChannelSender registered for provider "${provider}"`);
  }
  return sender;
}

export * from "./types.js";
