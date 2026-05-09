import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tamaguiPlugin } from '@tamagui/vite-plugin'
import path from 'path'

export default defineConfig({
  base: '/dashboard/',
  envDir: '../../',
  plugins: [
    react(),
    tailwindcss(),
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
})
