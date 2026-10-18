import type { FocusEvent, FormEvent, KeyboardEvent, MouseEvent, PointerEvent, Ref, SyntheticEvent } from 'react'
import { styled, Stack, Text as TamaguiText, type GetProps } from '@tamagui/core'
import { tokens } from '@kairo/tokens'
import { domProps } from './lib/dom-props'
import { ensureMotionStyles } from './lib/motion-css'

// Layout primitives. They behave like the plain HTML elements they replace
// (block by default, in the normal flow, no min-size clamp) so a screen can
// describe its layout with typed, token-aware props instead of an inline style.
// Set `tag` to keep the semantic element (ul, li, section, h2, ...).

const BoxFrame = styled(Stack, {
  name: 'KairoBox',
  display: 'block' as never,
  position: 'static' as never,
  flexDirection: 'row',
  flexShrink: 1,
  minWidth: 'auto' as never,
  minHeight: 'auto' as never,
  variants: {
    /** Scrolls its content when it overflows (CSS overflow: auto). */
    scroll: { true: { overflow: 'auto' as never } },
    /** Circle: border radius of half the box. */
    circle: { true: { borderRadius: '50%' as never } },
    /** Positioned against the viewport / sticks while scrolling. */
    fixed: { true: { position: 'fixed' as never } },
    sticky: { true: { position: 'sticky' as never } },
    inlineBlock: { true: { display: 'inline-block' as never } },
    grid: { true: { display: 'grid' as never } },
  } as const,
})

// Text starts from "inherit" for every font property so nested text keeps the
// look of its surroundings, exactly like a span does.
const TextFrame = styled(TamaguiText, {
  name: 'KairoText',
  color: 'inherit' as never,
  fontFamily: 'inherit' as never,
  fontSize: 'inherit' as never,
  fontWeight: 'inherit' as never,
  lineHeight: 'inherit' as never,
  letterSpacing: 'inherit' as never,
  whiteSpace: 'normal',
  wordWrap: 'normal' as never,
  margin: 0,
  display: 'inline' as never,
  variants: {
    // The three design font stacks, taken from the tokens.
    /** Scrolls its content when it overflows (CSS overflow: auto). */
    scroll: { true: { overflow: 'auto' as never } },
    circle: { true: { borderRadius: '50%' as never } },
    fixed: { true: { position: 'fixed' as never } },
    sticky: { true: { position: 'sticky' as never } },
    inlineBlock: { true: { display: 'inline-block' as never } },
    grid: { true: { display: 'grid' as never } },
    font: {
      sans: { fontFamily: tokens['font.family.sans'] as never },
      mono: { fontFamily: tokens['font.family.mono'] as never },
      display: { fontFamily: tokens['font.family.sans'] as never },
    },
  } as const,
})

type Handler<E> = (event: E) => void

/** Web-only extras: ARIA role, tooltip, DOM events, ref and a few CSS properties Tamagui has no prop for. */
type WebProps = {
  /** Native tooltip text. */
  title?: string
  /** Any ARIA role (the typed list omits several). */
  role?: string
  ref?: Ref<HTMLElement>
  onClick?: Handler<MouseEvent<HTMLElement>>
  onDoubleClick?: Handler<MouseEvent<HTMLElement>>
  onMouseDown?: Handler<MouseEvent<HTMLElement>>
  onMouseUp?: Handler<MouseEvent<HTMLElement>>
  onMouseEnter?: Handler<MouseEvent<HTMLElement>>
  onMouseLeave?: Handler<MouseEvent<HTMLElement>>
  onKeyDown?: Handler<KeyboardEvent<HTMLElement>>
  onSubmit?: Handler<FormEvent<HTMLElement>>
  onBlur?: Handler<FocusEvent<HTMLElement>>
  type?: 'button' | 'submit' | 'reset'
  htmlFor?: string
  gridTemplateColumns?: string
  transition?: string
  transform?: string
  listStyle?: 'none'
  fontStyle?: 'italic' | 'normal'
  wordBreak?: 'break-all' | 'break-word' | 'normal'
  textDecoration?: string
  backgroundImage?: string
  textUnderlineOffset?: number
  boxSizing?: 'content-box' | 'border-box'
  cssAnimation?: string
  overflowX?: 'auto' | 'hidden' | 'scroll' | 'visible'
  overflowY?: 'auto' | 'hidden' | 'scroll' | 'visible'
  /** Unitless line height (a multiple of the font size). */
  lineHeightRatio?: number
  onPointerDown?: Handler<PointerEvent<HTMLElement>>
  onPointerUp?: Handler<PointerEvent<HTMLElement>>
  onPointerLeave?: Handler<PointerEvent<HTMLElement>>
  onPointerCancel?: Handler<PointerEvent<HTMLElement>>
  onSelect?: Handler<SyntheticEvent<HTMLElement>>
  onKeyUp?: Handler<KeyboardEvent<HTMLElement>>
  onFocus?: Handler<FocusEvent<HTMLElement>>
  /** Fades the element in (a short entrance). */
  fadeIn?: boolean
  /** Slow opacity pulse, for a live indicator. */
  pulse?: boolean
  /** Clips the text to this many lines with an ellipsis. */
  lineClamp?: number
}

// Splits the web-only props into DOM attributes/events and an inline style
// object; the library is the one place allowed to build inline styles.
function webProps(props: WebProps): Record<string, never> {
  const { gridTemplateColumns, transition, transform, listStyle, fontStyle, wordBreak, textDecoration, backgroundImage, textUnderlineOffset, boxSizing, cssAnimation, fadeIn, pulse, lineClamp, overflowX, overflowY, lineHeightRatio, ...dom } = props
  const style: Record<string, string> = {}
  if (gridTemplateColumns) style.gridTemplateColumns = gridTemplateColumns
  if (transition) style.transition = transition
  if (transform) style.transform = transform
  if (listStyle) style.listStyle = listStyle
  if (fontStyle) style.fontStyle = fontStyle
  if (wordBreak) style.wordBreak = wordBreak
  if (textDecoration) style.textDecoration = textDecoration
  if (backgroundImage) style.backgroundImage = backgroundImage
  if (boxSizing) style.boxSizing = boxSizing
  if (cssAnimation) style.animation = cssAnimation
  if (lineClamp) Object.assign(style, { display: '-webkit-box', WebkitLineClamp: String(lineClamp), WebkitBoxOrient: 'vertical', overflow: 'hidden' })
  if (overflowX) style.overflowX = overflowX
  if (overflowY) style.overflowY = overflowY
  if (lineHeightRatio !== undefined) style.lineHeight = String(lineHeightRatio)
  if (textUnderlineOffset !== undefined) style.textUnderlineOffset = `${textUnderlineOffset}px`
  if (fadeIn || pulse) ensureMotionStyles()
  const className = [fadeIn ? 'kairo-ui-fade' : '', pulse ? 'kairo-ui-pulse' : ''].filter(Boolean).join(' ')
  return domProps({ ...dom, ...(className ? { className } : null), ...(Object.keys(style).length ? { style } : null) })
}

type BoxProps = Omit<GetProps<typeof BoxFrame>, 'role'> & WebProps
type TextProps = Omit<GetProps<typeof TextFrame>, 'role' | 'fontSize'> &
  WebProps & {
    /** A size token or number, or a relative size such as "0.94em". */
    fontSize?: GetProps<typeof TextFrame>['fontSize'] | `${number}em` | `${number}%`
  }

const WEB_KEYS = [
  'title', 'role', 'ref', 'fontSize', 'onClick', 'onDoubleClick', 'onMouseDown', 'onMouseUp', 'onMouseEnter', 'onMouseLeave',
  'onKeyDown', 'onSubmit', 'onFocus', 'onBlur', 'type', 'htmlFor', 'gridTemplateColumns', 'transition', 'transform',
  'listStyle', 'fontStyle', 'wordBreak', 'textDecoration', 'backgroundImage', 'textUnderlineOffset', 'boxSizing', 'cssAnimation', 'fadeIn', 'pulse', 'lineClamp', 'overflowX', 'overflowY', 'lineHeightRatio', 'onPointerDown', 'onPointerUp', 'onPointerLeave', 'onPointerCancel', 'onSelect', 'onKeyUp',
] as const

function split<P extends object>(props: P): [Record<string, unknown>, Record<string, unknown>] {
  const web: Record<string, unknown> = {}
  const rest = { ...props } as Record<string, unknown>
  for (const key of WEB_KEYS) {
    if (key in rest) {
      web[key] = rest[key]
      delete rest[key]
    }
  }
  return [web, rest]
}

function Box(props: BoxProps) {
  const [web, rest] = split(props)
  return <BoxFrame {...(rest as object)} {...webProps(web as WebProps)} />
}

function Text(props: TextProps) {
  const [web, rest] = split(props)
  return <TextFrame {...(rest as object)} {...webProps(web as WebProps)} />
}

// A real <button> with the browser's chrome removed: it takes the same style
// props as Text and inherits the surrounding font and color.
const PressableFrame = styled(TamaguiText, {
  name: 'KairoPressable',
  tag: 'button',
  color: 'inherit' as never,
  fontFamily: 'inherit' as never,
  fontSize: 'inherit' as never,
  fontWeight: 'inherit' as never,
  lineHeight: 'inherit' as never,
  letterSpacing: 'inherit' as never,
  whiteSpace: 'normal',
  display: 'inline-block' as never,
  margin: 0,
  padding: 0,
  borderWidth: 0,
  backgroundColor: 'transparent',
  textAlign: 'center',
  cursor: 'pointer',
  variants: {
    font: {
      sans: { fontFamily: tokens['font.family.sans'] as never },
      mono: { fontFamily: tokens['font.family.mono'] as never },
      display: { fontFamily: tokens['font.family.sans'] as never },
    },
    scroll: { true: { overflow: 'auto' as never } },
    circle: { true: { borderRadius: '50%' as never } },
    fixed: { true: { position: 'fixed' as never } },
    sticky: { true: { position: 'sticky' as never } },
    inlineBlock: { true: { display: 'inline-block' as never } },
    grid: { true: { display: 'grid' as never } },
  } as const,
})

type PressableProps = Omit<GetProps<typeof PressableFrame>, 'role' | 'fontSize' | 'type'> &
  WebProps & {
    fontSize?: GetProps<typeof TextFrame>['fontSize'] | `${number}em` | `${number}%`
    disabled?: boolean
  }

function Pressable({ disabled, ...props }: PressableProps) {
  const [web, rest] = split(props)
  return <PressableFrame {...(rest as object)} {...webProps(web as WebProps)} {...domProps({ disabled })} />
}

export { Box, Text, Pressable }
export type { BoxProps, TextProps, PressableProps }
