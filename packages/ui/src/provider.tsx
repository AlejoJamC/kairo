import type { ReactNode } from 'react'
import { TamaguiProvider } from '@tamagui/core'
import tamaguiConfig from '../tamagui.config'

type UiProviderProps = {
  children?: ReactNode
  theme?: 'light'
}

/**
 * Root provider for @kairo/ui. Apps mount this instead of importing the
 * styling engine, so the engine stays an implementation detail of this package.
 */
function UiProvider({ children, theme = 'light' }: UiProviderProps) {
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={theme}>
      {children}
    </TamaguiProvider>
  )
}

/** CSS of every style rendered so far: a server-rendering host injects it before hydration. */
function getUiCss(): string {
  return tamaguiConfig.getCSS()
}

export { UiProvider, getUiCss }
export type { UiProviderProps }
