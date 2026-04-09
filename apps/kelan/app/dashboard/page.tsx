import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard — Kelan',
};

export default function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-white mb-2">Dashboard</h1>
      <p className="text-gray-400">
        Kelan dashboard — Phase 2 coming soon.
      </p>
    </div>
  );
}
