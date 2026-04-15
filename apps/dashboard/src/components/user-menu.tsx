import { LogOut, User } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

export function UserMenu() {
  const { profile, signOut } = useAuth();

  if (!profile) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-3 border-t border-zinc-800">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center shrink-0">
          <User className="w-4 h-4 text-zinc-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-300 truncate">{profile.name || profile.email}</p>
          {profile.gmail_connected && (
            <p className="text-xs text-green-400">Gmail Connected</p>
          )}
        </div>
      </div>
      <button
        onClick={signOut}
        className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-md transition-colors"
        title="Logout"
      >
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  );
}
