import type { Metadata } from 'next';
import { LoginScreen } from '@/components/LoginScreen';
import { SEARCH_PARAMS, ERROR_CODES } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Sign in — Kelan',
};

interface LoginPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = params[SEARCH_PARAMS.ERROR];
  const isAccessDenied = error === ERROR_CODES.ACCESS_DENIED;

  return <LoginScreen accessDenied={isAccessDenied} />;
}
