import type { Metadata } from 'next';
import { DashboardHome } from '@/components/DashboardHome';

export const metadata: Metadata = {
  title: 'Dashboard — Kelan',
};

export default function DashboardPage() {
  return <DashboardHome />;
}
