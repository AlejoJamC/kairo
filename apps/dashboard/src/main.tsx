import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { UiProvider } from '@kairo/ui'
import { initWebTelemetry } from '@kairo/observability/web'
import { initClientCore } from '@kairo/client-core/config'
import { createWebPlatform } from '@kairo/client-core/web'
import { env } from './env'
import './index.css'
import './i18n/config'
import App from './App.tsx'

// KAI-126: no-op if VITE_OTEL_EXPORTER_OTLP_ENDPOINT is unset. Runs before
// render so fetch instrumentation is registered before any request fires.
initWebTelemetry({
  serviceName: env.VITE_OTEL_SERVICE_NAME,
  otlpEndpoint: env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT,
  ingestionApiKey: env.VITE_HYPERDX_INGESTION_API_KEY,
})

initClientCore({
  apiBaseUrl: env.VITE_API_BASE_URL,
  bffBaseUrl: env.VITE_BFF_BASE_URL,
  landingUrl: env.VITE_LANDING_URL,
  supabaseUrl: env.VITE_SUPABASE_URL,
  supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY,
  platform: createWebPlatform(),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UiProvider>
      <App />
    </UiProvider>
  </StrictMode>,
)
