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
  // True once tickets_count >= FAST_PATH_CONTINUE_THRESHOLD on the server.
  // Use this to enable the wizard "Continue" button without waiting for the
  // full scan to complete.
  threshold_reached: boolean;
}

interface UseClassificationProgressResult {
  data: ClassificationProgress | null;
  error: string | null;
  retry: () => void;
}

const POLL_INTERVAL_MS      = 1500;
const TIMEOUT_MS            = 120_000; // 2 minutes
const MAX_CONSECUTIVE_FAILS = 3;       // tolerate transient errors before showing error screen

export function useClassificationProgress(): UseClassificationProgressResult {
  const [data, setData]         = useState<ClassificationProgress | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const stoppedRef    = useRef(false);
  const abortRef      = useRef<AbortController | null>(null);
  const timerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failCountRef  = useRef(0);

  const retry = useCallback(() => {
    setError(null);
    setRetryKey((k) => k + 1);
  }, []);

  useEffect(() => {
    stoppedRef.current  = false;
    failCountRef.current = 0;

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

        failCountRef.current = 0; // successful response resets the fail counter
        setData(json);
        setError(null);

        // Stop polling only on terminal status. threshold_reached only enables
        // the Continue button (handled by the consumer) — the scan view must
        // keep updating until the pipeline truly finishes.
        if (json.status === "complete" || json.status === "failed") {
          stoppedRef.current = true;
          clearTimeout(timeoutRef.current!);
          return;
        }
      } catch (err: unknown) {
        if ((err as Error).name === "AbortError") return; // intentional cancel
        failCountRef.current += 1;
        if (failCountRef.current < MAX_CONSECUTIVE_FAILS) {
          // Transient error — keep polling, don't surface to the user yet.
          if (!stoppedRef.current) {
            timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
          }
          return;
        }
        // Exceeded consecutive fail threshold — give up and show error screen.
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
