// Native barrel — TypeScript resolves this when customConditions includes "react-native".
// Metro also resolves this file automatically at bundle time.
//
// Components shared between web and RN (no DOM APIs) are imported from the
// same source. Components with platform splits import from the .native.tsx stub
// so TypeScript sees RN-safe types only.
export * from './badge'
export * from './button'
export * from './card'
export * from './triage-tokens'
export * from './collapsible'
export * from './input'
export * from './separator'
// Platform-split — import .native.tsx explicitly so TypeScript never traverses the DOM-using .tsx files
export * from './scroll-area.native'
export * from './sheet.native'
export * from './dropdown-menu.native'
export * from './table.native'
export { cn } from './lib/utils'
