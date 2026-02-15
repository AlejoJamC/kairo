"use client";

import { useState, useEffect, useRef } from "react";

const statusMessages: [number, string][] = [
  [0, "Creating account..."],
  [20, "Connecting integrations..."],
  [50, "Setting up workspace..."],
  [80, "Almost there..."],
];

function getStatusMessage(progress: number): string {
  let message = statusMessages[0][1];
  for (const [threshold, msg] of statusMessages) {
    if (progress >= threshold) message = msg;
  }
  return message;
}

export function useProcessingSimulator(active: boolean) {
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) return;

    setProgress(0);
    const totalDuration = 4000;
    const intervalMs = 50;
    const increment = 100 / (totalDuration / intervalMs);

    intervalRef.current = setInterval(() => {
      setProgress((prev) => {
        const next = prev + increment;
        if (next >= 100) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 100;
        }
        return next;
      });
    }, intervalMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active]);

  return {
    progress: Math.min(Math.round(progress), 100),
    statusMessage: getStatusMessage(progress),
    isComplete: progress >= 100,
  };
}
