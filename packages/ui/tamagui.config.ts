import { config } from '@tamagui/config/v3'
import { createTamagui } from '@tamagui/core'

// Stub config using Tamagui's default v3 preset.
// KAI-134 will replace this with Kairo-specific tokens sourced from
// packages/claude_design/tokens.css (the read-only design source of truth).
const tamaguiConfig = createTamagui(config)

export type AppConfig = typeof tamaguiConfig

declare module '@tamagui/core' {
  interface TamaguiCustomConfig extends AppConfig {}
}

export default tamaguiConfig
