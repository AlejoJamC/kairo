import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/constants';

// Root page redirects to /dashboard.
// If the user is not authenticated, the dashboard layout will redirect to /login.
export default function Page() {
  redirect(ROUTES.DASHBOARD);
}
