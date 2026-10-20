import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { tamaguiPlugin } from '@tamagui/vite-plugin'
import path from 'path'
import { mkdirSync, writeFileSync } from 'fs'

// Serves the dashboard against fixtures (see preview/): the auth and Supabase
// modules of client-core are swapped for stubs. Run with `bun run preview:dev`.
const stubs: Plugin = {
  name: 'preview-stubs',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
    if (resolved?.id.endsWith('/client-core/src/supabase.ts')) return path.resolve(__dirname, 'preview/supabase-stub.ts')
    if (resolved?.id.endsWith('/client-core/src/auth.tsx')) return path.resolve(__dirname, 'preview/auth-stub.tsx')
    return null
  },
  // Every page navigation (any dashboard route) gets the preview entry.
  configureServer(server) {
    // POST /__snapshot/<name> stores a layout snapshot under preview/.snapshots.
    server.middlewares.use((req, res, next) => {
      const match = req.method === 'POST' && /^\/__snapshot\/([\w-]+)$/.exec(req.url ?? '')
      if (!match) return next()
      const chunks: Buffer[] = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => {
        const dir = process.env.PREVIEW_SNAPSHOT_DIR ?? path.resolve(__dirname, 'preview/.snapshots')
        mkdirSync(dir, { recursive: true })
        writeFileSync(path.join(dir, `${match[1]}.json`), Buffer.concat(chunks))
        res.end('ok')
      })
    })
    server.middlewares.use((req, _res, next) => {
      if (req.headers.accept?.includes('text/html')) req.url = '/preview/index.html'
      next()
    })
  },
}

export default defineConfig({
  root: __dirname,
  base: '/',
  envDir: '../../',
  plugins: [
    stubs,
    react(),
    tamaguiPlugin({
      config: path.resolve(__dirname, '../../packages/ui/tamagui.config.ts'),
      components: ['@tamagui/core'],
    }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { port: 5174 },
})
