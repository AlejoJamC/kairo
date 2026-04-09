import type { Metadata } from 'next';
import { LoginButton } from '@/components/LoginButton';
import { AccessDenied } from '@/components/AccessDenied';
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

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo / brand placeholder */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 mb-4">
            <span className="text-white font-bold text-xl">K</span>
          </div>
          <h1 className="text-2xl font-semibold text-white">Kelan</h1>
          <p className="mt-1 text-sm text-gray-400">Kairo Platform Administration</p>
        </div>

        {/* Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-xl">
          {isAccessDenied ? (
            <AccessDenied />
          ) : (
            <LoginButton />
          )}
        </div>
      </div>
    </main>
  );
}
