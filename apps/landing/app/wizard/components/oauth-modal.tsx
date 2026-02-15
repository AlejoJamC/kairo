"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle } from "lucide-react";
import type { OAuthProvider } from "../types";

interface OAuthModalProps {
  provider: OAuthProvider;
  onClose: (connected: boolean) => void;
}

export function OAuthModal({ provider, onClose }: OAuthModalProps) {
  const [status, setStatus] = useState<"loading" | "success">("loading");

  useEffect(() => {
    const timer = setTimeout(() => setStatus("success"), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (status === "success") {
      const timer = setTimeout(() => onClose(true), 800);
      return () => clearTimeout(timer);
    }
  }, [status, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl p-8 max-w-sm w-full mx-4 animate-slide-up">
        <div className="text-center">
          <div
            className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{ backgroundColor: `${provider.color}15` }}
          >
            <provider.icon size={32} style={{ color: provider.color }} />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Connect to {provider.name}
          </h3>

          {status === "loading" ? (
            <>
              <p className="text-sm text-gray-500 mb-6">
                Authorizing with {provider.name}...
              </p>
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
            </>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-6">
                Successfully connected!
              </p>
              <CheckCircle className="w-8 h-8 text-green-500 mx-auto" />
            </>
          )}
        </div>

        <button
          onClick={() => onClose(false)}
          className="mt-6 w-full text-sm text-gray-400 hover:text-gray-600 transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
