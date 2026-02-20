"use client";

import { useEffect, useState } from "react";
import { LogOut, User } from "lucide-react";

interface UserData {
  email: string;
  accountType: string;
  gmailConnected: boolean;
}

export function UserMenu() {
  const [user, setUser] = useState<UserData | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  };

  if (!user) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-3 border-t border-zinc-800">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center shrink-0">
          <User className="w-4 h-4 text-zinc-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-300 truncate">{user.email}</p>
          {user.gmailConnected && (
            <p className="text-xs text-green-400">Gmail Connected</p>
          )}
        </div>
      </div>
      <button
        onClick={handleLogout}
        className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-md transition-colors"
        title="Logout"
      >
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  );
}
