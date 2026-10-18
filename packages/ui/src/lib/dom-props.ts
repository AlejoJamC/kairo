/** DOM-only event props (onClick, onKeyDown) that Tamagui's cross-platform types leave out. */
export function domProps(props: Record<string, unknown>): Record<string, never> {
  return props as Record<string, never>
}
