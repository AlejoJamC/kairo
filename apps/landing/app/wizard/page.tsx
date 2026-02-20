"use client";

import { getApiUrl } from "@/lib/api-config";

export default function WizardPage() {
  const handleGoogleSignIn = () => {
    const apiUrl = getApiUrl();
    window.location.href = `${apiUrl}/api/auth/google`;
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-sm p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">
            Welcome to Kairo
          </h1>
          <p className="text-neutral-600">
            Connect your support inbox to get started
          </p>
        </div>

        <button
          onClick={handleGoogleSignIn}
          className="w-full px-6 py-3 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors flex items-center justify-center gap-3 text-base font-medium text-neutral-900 shadow-sm"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
              fill="#4285F4"
            />
            <path
              d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
              fill="#34A853"
            />
            <path
              d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
              fill="#FBBC05"
            />
            <path
              d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </button>

        <div className="mt-6 text-center text-sm text-neutral-500">
          <p>Kairo needs access to read your Gmail</p>
          <p>to automatically triage support tickets</p>
        </div>

        <div className="mt-6 text-center">
          <button
            disabled
            className="text-sm text-neutral-400 cursor-not-allowed"
          >
            Continue with Email &rarr;
          </button>
          <p className="text-xs text-neutral-400 mt-1">(Coming soon)</p>
        </div>
      </div>
    </div>
  );
}
