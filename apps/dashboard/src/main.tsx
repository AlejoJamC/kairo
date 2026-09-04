import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TamaguiProvider } from '@tamagui/core'
import { initWebTelemetry } from '@kairo/observability/web'
import tamaguiConfig from '@kairo/ui/tamagui.config'
import { env } from './env'
import './index.css'
import './i18n/config'
import App from './App.tsx'

// KAI-126: no-op if VITE_OTEL_EXPORTER_OTLP_ENDPOINT is unset. Runs before
// render so fetch instrumentation is registered before any request fires.
initWebTelemetry({
  serviceName: env.VITE_OTEL_SERVICE_NAME,
  otlpEndpoint: env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT,
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* TamaguiProvider exposes tokens, themes, and styled primitives from @kairo/ui to the entire tree. */}
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <App />
    </TamaguiProvider>
  </StrictMode>,
)
