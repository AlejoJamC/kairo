"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type ProgressStatus = "idle" | "in_progress" | "complete" | "failed";

export interface ClassificationProgress {
  status: ProgressStatus;
  tickets_count: number;
  threads_count: number;
  clients_count: number;
  categories: {
    technical: number;
    billing: number;
    account: number;
    general: number;
    not_applicable: number;
  };
  window: { since: string; until: string };
  last_classified_at: string | null;
}

interface UseClassificationProgressResult {
  data: ClassificationProgress | null;
  error: string | null;
  retry: () => void;
}

const POLL_INTERVAL_MS  = 1500;
const TIMEOUT_MS        = 120_000; // 2 minutes

export function useClassificationProgress(): UseClassificationProgressResult {
  const [data, setData]         = useState<ClassificationProgress | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const stoppedRef  = useRef(false);
  const abortRef    = useRef<AbortController | null>(null);
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const retry = useCallback(() => {
    setError(null);
    setRetryKey((k) => k + 1);
  }, []);

  useEffect(() => {
    stoppedRef.current = false;

    // 2-minute hard stop → error state so users are never stuck
    timeoutRef.current = setTimeout(() => {
      if (!stoppedRef.current) {
        stoppedRef.current = true;
        setError("timeout");
      }
    }, TIMEOUT_MS);

    const poll = async () => {
      if (stoppedRef.current) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/bff/classification/progress", { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as ClassificationProgress;

        setData(json);
        setError(null);

        // Stop polling on terminal status
        if (json.status === "complete" || json.status === "failed") {
          stoppedRef.current = true;
          clearTimeout(timeoutRef.current!);
          return;
        }
      } catch (err: unknown) {
        if ((err as Error).name === "AbortError") return; // intentional cancel
        stoppedRef.current = true;
        clearTimeout(timeoutRef.current!);
        setError(err instanceof Error ? err.message : "fetch_error");
        return;
      }

      if (!stoppedRef.current) {
        timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    // Pause on tab hide, resume on tab visible
    const handleVisibility = () => {
      if (document.hidden) {
        clearTimeout(timerRef.current!);
        abortRef.current?.abort();
      } else if (!stoppedRef.current) {
        poll();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    poll();

    return () => {
      stoppedRef.current = true;
      clearTimeout(timerRef.current!);
      clearTimeout(timeoutRef.current!);
      abortRef.current?.abort();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [retryKey]);

  return { data, error, retry };
}
