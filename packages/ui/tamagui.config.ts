import { createFont, createTamagui, createTokens, createTheme } from '@tamagui/core'
import { tokens as designTokens } from '@kairo/tokens'

// ---------------------------------------------------------------------------
// Kairo design tokens
//
// Every value comes from @kairo/tokens (generated from packages/tokens/src).
// Do not write color, font or shadow literals here: change the token sources.
// ---------------------------------------------------------------------------

// ─── Color tokens ──────────────────────────────────────────────────────────
// Named after the CSS variables in tokens.css.
const tokens = createTokens({
  color: {
    // Backgrounds & surfaces
    background:    designTokens['color.bg'],
    surface:       designTokens['color.sunk'],
    surface2:      designTokens['color.hover'],
    // Borders
    border:        designTokens['color.line'],
    borderSubtle:  designTokens['color.line'],
    // Text scale
    textPrimary:   designTokens['color.text'],
    textSecondary: designTokens['color.muted'],
    textTertiary:  designTokens['color.faint'],
    // Accent
    accent:        designTokens['color.accent'],
    accentHover:   designTokens['color.accent-hover'],
    accentSubtle:  designTokens['color.accent-soft'],
    // Semantic status
    success:       designTokens['color.ok'],
    warning:       designTokens['color.warn'],
    danger:        designTokens['color.bad'],
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
  family: designTokens['font.family.sans'],
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
  // Tamagui letterSpacing is in pixels; -0.02em@48px ≈ -1px, -0.03em@72px ≈ -2px
  letterSpacing: {
    8:    -1,
    9:    -2,
    true: 0,
  },
})

const bodyFont = createFont({
  family: designTokens['font.family.sans'],
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
    true: 0,
  },
})

const monoFont = createFont({
  family: designTokens['font.family.mono'],
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
  // 0.02em at 13px ≈ 0.26px; rounded to 0.25
  letterSpacing: {
    true: 0.25,
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

// ─── Final config ────────────────────────────────────────────────────────────

const tamaguiConfig = createTamagui({
  tokens,
  themes: {
    light: lightTheme,
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
// Values Tamagui cannot hold as tokens (gradients, composite shadows), derived
// from the same sources so web code can use them directly.
// ---------------------------------------------------------------------------

export const aiGlow =
  `linear-gradient(135deg, ${designTokens['color.accent']} 0%, ${designTokens['color.accent-indigo']} 100%)` as const

export const shadowCard = designTokens['shadow.xs']
