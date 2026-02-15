"use client";

import { CheckCircle, ArrowRight } from "lucide-react";
import { useProcessingSimulator } from "../hooks/use-processing-simulator";
import { ProgressBar } from "./progress-bar";

export function Step3Processing() {
  const { progress, statusMessage, isComplete } = useProcessingSimulator(true);

  if (isComplete) {
    return (
      <div className="text-center py-8 animate-fade-in">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          You&apos;re all set!
        </h2>
        <p className="text-gray-500 mb-8">
          Your workspace is ready. Let&apos;s get started.
        </p>
        <a
          href="/dashboard/"
          className="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition"
        >
          Go to Dashboard
          <ArrowRight size={18} />
        </a>
      </div>
    );
  }

  return (
    <div className="py-8 space-y-6">
      <ProgressBar progress={progress} />
      <p className="text-center text-gray-600 animate-pulse">{statusMessage}</p>
    </div>
  );
}
