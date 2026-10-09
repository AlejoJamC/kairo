import {
  GmailHistoryExpiredError,
  type GmailHistoryListResponse,
  type GmailMessage,
  type GmailMessageListResponse,
  type GmailProfile,
} from './types.js';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1';

async function gmailGet<T>(token: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${GMAIL_BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 404 && path === 'users/me/history') throw new GmailHistoryExpiredError();
  if (!response.ok) throw new Error(`Gmail request failed (HTTP ${response.status})`);
  return response.json() as Promise<T>;
}

export function getProfile(token: string): Promise<GmailProfile> {
  return gmailGet(token, 'users/me/profile');
}

export function historyList(token: string, startHistoryId: string, pageToken?: string): Promise<GmailHistoryListResponse> {
  return gmailGet(token, 'users/me/history', {
    startHistoryId, historyTypes: 'messageAdded', labelId: 'INBOX', ...(pageToken ? { pageToken } : {}),
  });
}

export function messagesList(token: string, pageToken?: string): Promise<GmailMessageListResponse> {
  return gmailGet(token, 'users/me/messages', { maxResults: '100', labelIds: 'INBOX', ...(pageToken ? { pageToken } : {}) });
}

export function getMessage(token: string, messageId: string): Promise<GmailMessage> {
  return gmailGet(token, `users/me/messages/${encodeURIComponent(messageId)}`, { format: 'full' });
}
