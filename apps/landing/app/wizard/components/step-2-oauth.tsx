"use client";

import { useState, useCallback } from "react";
import { CheckCircle } from "lucide-react";
import { Chrome, Monitor, MessageSquare } from "lucide-react";
import type { FormData, OAuthProvider } from "../types";
import { OAuthModal } from "./oauth-modal";

const providers: OAuthProvider[] = [
  { id: "google", name: "Google Workspace", icon: Chrome, color: "#4285F4" },
  { id: "microsoft", name: "Microsoft 365", icon: Monitor, color: "#00A4EF" },
  { id: "slack", name: "Slack", icon: MessageSquare, color: "#4A154B" },
];

interface Step2Props {
  formData: FormData;
  onUpdate: (updates: Partial<FormData>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step2OAuth({ formData, onUpdate, onNext, onBack }: Step2Props) {
  const [activeProvider, setActiveProvider] = useState<OAuthProvider | null>(null);

  const handleModalClose = useCallback(
    (connected: boolean) => {
      if (connected && activeProvider) {
        const updated = [...formData.connectedProviders];
        if (!updated.includes(activeProvider.id)) {
          updated.push(activeProvider.id);
        }
        onUpdate({ connectedProviders: updated });
      }
      setActiveProvider(null);
    },
    [activeProvider, formData.connectedProviders, onUpdate]
  );

  return (
    <div>
      <div className="space-y-3 mb-8">
        {providers.map((provider) => {
          const isConnected = formData.connectedProviders.includes(provider.id);
          return (
            <button
              key={provider.id}
              onClick={() => !isConnected && setActiveProvider(provider)}
              className={`w-full flex items-center gap-4 p-4 border rounded-xl transition hover:shadow-md ${
                isConnected
                  ? "border-green-200 bg-green-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${provider.color}15` }}
              >
                <provider.icon size={24} style={{ color: provider.color }} />
              </div>
              <div className="flex-1 text-left">
                <div className="font-medium text-gray-900">{provider.name}</div>
                <div className="text-sm text-gray-500">
                  {isConnected ? "Connected" : "Click to connect"}
                </div>
              </div>
              {isConnected && (
                <CheckCircle className="w-6 h-6 text-green-500" />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={onNext}
          className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition"
        >
          Continue
        </button>
        <div className="flex justify-between">
          <button
            onClick={onBack}
            className="text-sm text-gray-500 hover:text-gray-700 transition"
          >
            ← Back
          </button>
          <button
            onClick={onNext}
            className="text-sm text-gray-500 hover:text-gray-700 transition"
          >
            Skip this step
          </button>
        </div>
      </div>

      {activeProvider && (
        <OAuthModal provider={activeProvider} onClose={handleModalClose} />
      )}
    </div>
  );
}
