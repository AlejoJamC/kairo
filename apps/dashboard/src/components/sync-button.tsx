'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiCall } from '@/lib/api-client';

interface SyncSummary {
  processed: number;
  created: number;
  skipped: number;
  total: number;
  message?: string;
}

interface SyncButtonProps {
  onSyncComplete?: () => void;
}

export function SyncButton({ onSyncComplete }: SyncButtonProps) {
  const [syncing, setSyncing] = useState(false);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setSummary(null);

    try {
      const response = await apiCall('/api/gmail/sync', { method: 'POST' });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Sync failed');
      }

      const data = await response.json();
      setSummary(data.summary);
      onSyncComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync Gmail');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="border-b px-4 py-3">
      <button
        onClick={handleSync}
        disabled={syncing}
        className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300 transition-colors"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
        {syncing ? 'Syncing...' : 'Sync Gmail'}
      </button>

      {summary && (
        <div className="mt-2 rounded-md bg-green-50 border border-green-200 p-2 text-xs text-green-800">
          <p className="font-medium">Sync complete</p>
          <p className="mt-0.5 text-green-700">
            {summary.created} new · {summary.skipped} skipped
          </p>
        </div>
      )}

      {error && (
        <div className="mt-2 rounded-md bg-red-50 border border-red-200 p-2 text-xs text-red-800">
          {error}
        </div>
      )}
    </div>
  );
}
