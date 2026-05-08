import { verifyAdminSession } from '@/lib/auth/guard';

export async function GET() {
  const admin = await verifyAdminSession();

  if (!admin) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return Response.json({ admin });
}
