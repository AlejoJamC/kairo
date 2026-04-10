import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { verifyAdminSession } from '@/lib/auth/guard';
import { AdminShell } from '@/components/AdminShell';
import { ROUTES } from '@/lib/constants';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const admin = await verifyAdminSession();

  if (!admin) {
    redirect(ROUTES.LOGIN);
  }

  return <AdminShell admin={admin}>{children}</AdminShell>;
}
