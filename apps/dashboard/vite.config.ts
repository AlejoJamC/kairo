import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tamaguiPlugin } from '@tamagui/vite-plugin'
import path from 'path'
import { localSupabaseConfig } from '../../packages/feature-flags/src/flags'

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
