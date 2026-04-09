import Link from 'next/link';
import { ROUTES } from '@/lib/constants';

export function AccessDenied() {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10">
        <svg
          className="w-6 h-6 text-red-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
          />
        </svg>
      </div>
      <div>
        <h2 className="text-base font-semibold text-white">Access denied</h2>
        <p className="mt-2 text-sm text-gray-400">
          Your account does not have access to Kelan. Contact the platform
          administrator.
        </p>
      </div>
      <Link
        href={ROUTES.LOGIN}
        className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
      >
        Try a different account
      </Link>
    </div>
  );
}
