'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiCall } from '@/lib/api-client';

interface SyncButtonProps {
  onSyncComplete?: () => void;
}

export function SyncButton({ onSyncComplete }: SyncButtonProps) {
  const [syncing, setSyncing] = useState(false);
  // KAI-248: /bff/gmail/sync no longer processes emails synchronously — it
  // only dispatches the inbound/gmail.poll.requested event. There is no more
  // per-request summary (processed/created/skipped); the poll worker runs
  // asynchronously, so we just confirm the dispatch succeeded.
  const [dispatched, setDispatched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setDispatched(false);

    try {
      const response = await apiCall('/bff/gmail/sync', { method: 'POST' });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Sync failed');
      }

      setDispatched(true);
      onSyncComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync Gmail');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div
      style={{
        borderBottom: "1px solid var(--k-border-subtle)",
        padding: "6px 14px 8px",
      }}
    >
      <button
        onClick={handleSync}
        disabled={syncing}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 11,
          padding: "4px 9px",
          borderRadius: 5,
          border: "1px solid var(--k-border)",
          color: syncing ? "var(--k-text-tertiary)" : "var(--k-text-secondary)",
          background: "white",
          fontFamily: "var(--k-font-mono)",
          cursor: syncing ? "not-allowed" : "pointer",
          opacity: syncing ? 0.6 : 1,
        }}
      >
        <RefreshCw
          style={{ width: 11, height: 11 }}
          className={syncing ? 'animate-spin' : ''}
        />
        {syncing ? 'Syncing…' : 'Sync Gmail'}
      </button>

      {dispatched && (
        <div
          style={{
            marginTop: 6,
            padding: "5px 8px",
            borderRadius: 4,
            background: "#ECFDF5",
            border: "1px solid #A7F3D0",
            fontSize: 11,
            color: "#065F46",
            fontFamily: "var(--k-font-mono)",
          }}
        >
          Sync requested — new emails will appear shortly
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 6,
            padding: "5px 8px",
            borderRadius: 4,
            background: "#FEF2F2",
            border: "1px solid #FECACA",
            fontSize: 11,
            color: "#991B1B",
            fontFamily: "var(--k-font-mono)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
