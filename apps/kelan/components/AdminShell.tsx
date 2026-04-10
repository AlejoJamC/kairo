import type { ReactNode } from 'react';
import type { AdminUser } from '@kairo/types';
import { signOut } from '@/lib/auth/actions';

interface AdminShellProps {
  admin: AdminUser;
  children: ReactNode;
}

export function AdminShell({ admin, children }: AdminShellProps) {
  return (
    <div className="flex min-h-screen bg-gray-950">
      {/* Sidebar — placeholder for Phase 2 navigation */}
      <aside className="w-60 shrink-0 border-r border-gray-800 bg-gray-900 flex flex-col">
        <div className="p-5 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">K</span>
            </div>
            <span className="font-semibold text-white text-sm">Kelan</span>
          </div>
        </div>

        <nav className="flex-1 p-3">
          {/* Phase 2 navigation items go here */}
          <p className="px-3 py-2 text-xs text-gray-500 font-medium uppercase tracking-wide">
            Navigation — Phase 2
          </p>
        </nav>

        {/* Admin identity + sign out */}
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-indigo-700 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-medium">
                {admin.display_name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {admin.display_name}
              </p>
              <p className="text-xs text-gray-400 truncate">{admin.email}</p>
            </div>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="w-full text-left text-xs text-gray-400 hover:text-white transition-colors px-2 py-1.5 rounded hover:bg-gray-800"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
