"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface UserData {
  id: string;
  email: string;
  name: string;
  company_name?: string;
}

export default function CompleteProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) {
          router.push("/wizard/");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        setUser(data.user);

        if (data.user.company_name) {
          router.push("/dashboard/");
          return;
        }

        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load profile. Please try again.");
        setLoading(false);
      });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!companyName.trim()) {
      setError("Company name is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_name: companyName }),
      });

      if (!response.ok) {
        throw new Error("Failed to update profile");
      }

      router.push("/dashboard/");
    } catch {
      setError("Failed to save. Please try again.");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-neutral-600">Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-sm p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">
            Complete Your Profile
          </h1>
          <p className="text-neutral-600">
            Just one more step before you get started
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-neutral-900 mb-2">
              Email
            </label>
            <div className="relative">
              <input
                type="email"
                value={user.email}
                disabled
                className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-600 cursor-not-allowed"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-600">
                &#10003;
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-1">From Google</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-neutral-900 mb-2">
              Name
            </label>
            <div className="relative">
              <input
                type="text"
                value={user.name}
                disabled
                className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-600 cursor-not-allowed"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-600">
                &#10003;
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-1">From Google</p>
          </div>

          <div>
            <label
              htmlFor="company"
              className="block text-sm font-semibold text-neutral-900 mb-2"
            >
              Company Name
            </label>
            <input
              id="company"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme Inc."
              className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
              autoFocus
              required
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving || !companyName.trim()}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-neutral-300 disabled:cursor-not-allowed font-medium"
          >
            {saving ? "Saving..." : "Continue to Dashboard \u2192"}
          </button>
        </form>
      </div>
    </div>
  );
}
