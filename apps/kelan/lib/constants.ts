export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  AUTH_CALLBACK: '/auth/callback',
} as const;

export const ERROR_CODES = {
  ACCESS_DENIED: 'access_denied',
} as const;

export const ADMIN_ROLES = {
  ADMIN: 'admin',
  SUPERADMIN: 'superadmin',
} as const satisfies Record<string, import('@kairo/types').AdminRole>;

export const SEARCH_PARAMS = {
  ERROR: 'error',
} as const;
