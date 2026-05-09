import { createFont, createTamagui, createTokens, createTheme } from '@tamagui/core'

// ---------------------------------------------------------------------------
// KAIRO DESIGN TOKENS (KAI-153)
//
// Token names and structure mirror packages/claude_design/tokens.css (read-only
// source of truth). All values are reconciled against that file — no placeholders
// remain. Gradient and multi-stop shadow values are exported as raw string
// constants below (not in createTokens) because Tamagui's token system does not
// have first-class gradient or multi-value box-shadow types.
//
// DO NOT edit packages/claude_design/* — it is read-only.
// ---------------------------------------------------------------------------

// ─── Color tokens ──────────────────────────────────────────────────────────
// Named after the CSS variables in tokens.css.
const tokens = createTokens({
  color: {
    // Backgrounds & surfaces
    background:    '#ffffff',
    surface:       '#fafafa',
    surface2:      '#f4f4f5',
    // Borders
    border:        '#e4e4e7',
    borderSubtle:  '#f0f0f1',
    // Text scale
    textPrimary:   '#09090b',
    textSecondary: '#52525b',
    textTertiary:  '#a1a1aa',
    // Accent — tokens.css: --accent / --accent-hover / --accent-subtle
    accent:        '#2B5BFF',
    accentHover:   '#1E48E5',
    accentSubtle:  '#EEF2FF',
    // Semantic status
    success:       '#10b981',
    warning:       '#f59e0b',
    danger:        '#ef4444',
    // Utility
    white:         '#ffffff',
    black:         '#000000',
    transparent:   'rgba(0,0,0,0)',
  },

  // ─── Spacing ────────────────────────────────────────────────────────────
  // 4-point grid. Covers design-spec values 4/8/12/16/24/32/48/64px.
  space: {
    0:    0,
    1:    4,
    2:    8,
    3:    12,
    4:    16,
    5:    24,
    6:    32,
    7:    48,
    8:    64,
    true: 16,
  },

  // ─── Size ───────────────────────────────────────────────────────────────
  size: {
    0:    0,
    1:    4,
    2:    8,
    3:    12,
    4:    16,
    5:    24,
    6:    32,
    7:    48,
    8:    64,
    true: 16,
  },

  // ─── Radii ──────────────────────────────────────────────────────────────
  // Mirrors tokens.css: --radius-input: 6px / --radius-inner: 8px / --radius-card: 12px
  radius: {
    0:     0,
    1:     4,
    input: 6,
    inner: 8,
    card:  12,
    true:  8,
  },

  // ─── Z-index ────────────────────────────────────────────────────────────
  zIndex: {
    0:    0,
    1:    100,
    2:    200,
    3:    300,
    4:    400,
    5:    500,
    true: 100,
  },
})

// ─── Fonts ──────────────────────────────────────────────────────────────────
// Families mirror tokens.css font stacks: Inter Display, Inter, JetBrains Mono.
// Size scale maps to the design type spec (hero 72 / h2 48 / h3 20 / body 16 / small 12).

const displayFont = createFont({
  family: '"Inter Display", "Inter", system-ui, -apple-system, sans-serif',
  size: {
    1:    12,   // small / fig-ref
    2:    13,   // kbd / ticket-id
    3:    14,
    4:    16,   // body
    5:    20,   // card h3
    6:    24,
    7:    32,
    8:    48,   // section h2
    9:    72,   // hero h1
    true: 16,
  },
  lineHeight: {
    1:    1.4,
    2:    1.4,
    3:    1.5,
    4:    1.6,
    5:    1.3,
    6:    1.2,
    7:    1.1,
    8:    1.1,
    9:    1.05,
    true: 1.6,
  },
  weight: {
    4:    '400',
    5:    '500',
    6:    '600',
    true: '400',
  },
  letterSpacing: {
    8:    '-0.02em',
    9:    '-0.03em',
    true: '0em',
  },
})

const bodyFont = createFont({
  family: '"Inter", system-ui, -apple-system, sans-serif',
  size: {
    1:    12,
    2:    13,
    3:    14,
    4:    16,
    5:    18,
    6:    20,
    true: 16,
  },
  lineHeight: {
    1:    1.4,
    2:    1.4,
    3:    1.5,
    4:    1.6,
    5:    1.5,
    6:    1.4,
    true: 1.6,
  },
  weight: {
    4:    '400',
    5:    '500',
    6:    '600',
    true: '400',
  },
  letterSpacing: {
    true: '0em',
  },
})

const monoFont = createFont({
  family: '"JetBrains Mono", "SF Mono", ui-monospace, monospace',
  size: {
    1:    11,
    2:    12,
    3:    13,
    4:    14,
    true: 13,
  },
  lineHeight: {
    true: 1.4,
  },
  weight: {
    true: '500',
  },
  letterSpacing: {
    true: '0.02em',
  },
})

// ─── Themes ─────────────────────────────────────────────────────────────────
// Semantic mappings. Token references are expressed as template-string variables
// ($color.<name>) so Tamagui resolves them at runtime. String literals are used
// for values that don't map to a named token above (e.g. overlay).

const lightTheme = createTheme({
  background:        tokens.color.background,
  backgroundHover:   tokens.color.surface,
  backgroundPress:   tokens.color.surface2,
  color:             tokens.color.textPrimary,
  colorSecondary:    tokens.color.textSecondary,
  colorTertiary:     tokens.color.textTertiary,
  borderColor:       tokens.color.border,
  borderColorSubtle: tokens.color.borderSubtle,
  // Accent
  primary:           tokens.color.accent,
  primaryHover:      tokens.color.accentHover,
  primarySubtle:     tokens.color.accentSubtle,
  // Semantic
  success:           tokens.color.success,
  warning:           tokens.color.warning,
  danger:            tokens.color.danger,
})

const darkTheme = createTheme({
  background:        '#09090b',
  backgroundHover:   '#111113',
  backgroundPress:   '#1c1c1e',
  color:             '#fafafa',
  colorSecondary:    '#a1a1aa',
  colorTertiary:     '#71717a',
  borderColor:       '#27272a',
  borderColorSubtle: '#18181b',
  primary:           tokens.color.accent,
  primaryHover:      tokens.color.accentHover,
  primarySubtle:     '#1c1c2e',
  success:           tokens.color.success,
  warning:           tokens.color.warning,
  danger:            tokens.color.danger,
})

// ─── Final config ────────────────────────────────────────────────────────────

const tamaguiConfig = createTamagui({
  tokens,
  themes: {
    light: lightTheme,
    dark:  darkTheme,
  },
  fonts: {
    display: displayFont,
    body:    bodyFont,
    mono:    monoFont,
    heading: displayFont, // alias used by Tamagui's built-in heading components
  },
  // Breakpoints — 1280px max container mirrors the design spec
  media: {
    xs:           { maxWidth: 660 },
    sm:           { maxWidth: 800 },
    md:           { maxWidth: 1020 },
    lg:           { maxWidth: 1280 },
    xl:           { minWidth: 1281 },
    gtXs:         { minWidth: 661 },
    gtSm:         { minWidth: 801 },
    gtMd:         { minWidth: 1021 },
    gtLg:         { minWidth: 1281 },
    hoverNone:    { hover: 'none' },
    pointerCoarse: { pointer: 'coarse' },
  },
  // CSS shorthand aliases (optional, keeps JSX terse)
  shorthands: {
    px: 'paddingHorizontal',
    py: 'paddingVertical',
    mx: 'marginHorizontal',
    my: 'marginVertical',
    bg: 'backgroundColor',
    br: 'borderRadius',
  } as const,
})

export type AppConfig = typeof tamaguiConfig

declare module '@tamagui/core' {
  interface TamaguiCustomConfig extends AppConfig {}
}

export default tamaguiConfig

// ---------------------------------------------------------------------------
// Non-token design constants (KAI-153)
//
// These values exist in tokens.css but cannot be represented as Tamagui tokens:
//   • gradients are not a first-class token type
//   • multi-stop box-shadow strings are not a first-class token type
//
// Use these constants directly in CSS-in-JS / inline styles on web, or
// platform-split them in individual components for React Native.
// ---------------------------------------------------------------------------

/** --ai-glow: linear-gradient(135deg, #2B5BFF 0%, #6E8BFF 100%) */
export const aiGlow = 'linear-gradient(135deg, #2B5BFF 0%, #6E8BFF 100%)' as const

/** --shadow-card: 0 1px 2px rgba(9, 9, 11, 0.04) */
export const shadowCard = '0 1px 2px rgba(9, 9, 11, 0.04)' as const

/** --shadow-popover: 0 4px 16px rgba(9, 9, 11, 0.08), 0 1px 2px rgba(9, 9, 11, 0.04) */
export const shadowPopover = '0 4px 16px rgba(9, 9, 11, 0.08), 0 1px 2px rgba(9, 9, 11, 0.04)' as const
