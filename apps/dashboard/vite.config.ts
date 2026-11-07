import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { tamaguiPlugin } from '@tamagui/vite-plugin'
import path from 'path'
import { localSupabaseConfig } from '../../packages/feature-flags/src/flags'

// The router drops the trailing slash of the base (`/dashboard`), and Vite answers that address with a
// 404 page. Send it to the base so a reload or a link without the slash still opens the app.
function redirectBaseWithoutSlash(base: string): Plugin {
  const bare = base.replace(/\/$/, '')
  const redirect = (req: { url?: string }, res: { statusCode: number; setHeader(name: string, value: string): void; end(): void }, next: () => void) => {
    const [pathname, query] = (req.url ?? '').split('?')
    if (bare && pathname === bare) {
      res.statusCode = 302
      res.setHeader('Location', `${base}${query ? `?${query}` : ''}`)
      res.end()
      return
    }
    next()
  }
  return {
    name: 'redirect-base-without-slash',
    configureServer: (server) => { server.middlewares.use(redirect) },
    configurePreviewServer: (server) => { server.middlewares.use(redirect) },
  }
}

export default defineConfig(() => {
  const localSupabase = localSupabaseConfig(process.env)
  return {
  define: localSupabase ? {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(localSupabase.url),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(localSupabase.anonKey),
  } : {},
  // The web build is served under /dashboard/ by the landing app; other hosts
  // (desktop shell, standalone hosting) override it with DASHBOARD_BASE_PATH.
  base: process.env.DASHBOARD_BASE_PATH ?? '/dashboard/',
  envDir: '../../',
  plugins: [
    redirectBaseWithoutSlash(process.env.DASHBOARD_BASE_PATH ?? '/dashboard/'),
    react(),
    tamaguiPlugin({
      config: path.resolve(__dirname, '../../packages/ui/tamagui.config.ts'),
      components: ['@tamagui/core'],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // Keep the browser and desktop dev hosts on the same loopback origin.
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/bff': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  }
})
