import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TamaguiProvider } from '@tamagui/core'
import tamaguiConfig from '@kairo/ui/tamagui.config'
import './index.css'
import './i18n/config'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* TamaguiProvider exposes tokens, themes, and styled primitives from @kairo/ui to the entire tree. */}
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <App />
    </TamaguiProvider>
  </StrictMode>,
)
