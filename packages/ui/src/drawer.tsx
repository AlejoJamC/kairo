import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { styled, Stack, Text } from '@tamagui/core'
import { tokens } from '@kairo/tokens'
import { Icon } from './icon'
import { ensureMotionStyles } from './lib/motion-css'
import { px } from './lib/units'
import { domProps, useEscape, useFocusScope } from './lib/overlay'

// Side panel that slides over the page to show secondary detail without
// leaving the current view. Entered from the right in 160ms (no slide with
// prefers-reduced-motion). esc, the close button and a scrim press close it.

const Scrim = styled(Stack, {
  name: 'DrawerScrim',
  position: 'fixed' as never,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 90,
  alignItems: 'flex-end',
  backgroundColor: tokens['surface.scrim'],
})

const Panel = styled(Stack, {
  name: 'Drawer',
  height: '100%',
  width: px(tokens['layout.context']),
  maxWidth: '100%',
  backgroundColor: tokens['surface.panel'],
  borderLeftWidth: 1,
  borderLeftColor: tokens['border.default'],
  boxShadow: tokens['shadow.pop'],
  outlineWidth: 0,
})

const Header = styled(Stack, {
  name: 'DrawerHeader',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  height: px(tokens['size.header']),
  flexShrink: 0,
  paddingHorizontal: 18,
})

const Title = styled(Text, {
  name: 'DrawerTitle',
  fontSize: 16,
  fontWeight: '600',
  letterSpacing: -0.16,
  lineHeight: 21,
  color: tokens['text.primary'],
})

const CloseButton = styled(Stack, {
  name: 'DrawerClose',
  tag: 'button',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: px(tokens['radius.control']),
  borderWidth: 0,
  backgroundColor: 'transparent',
  cursor: 'pointer',
  hoverStyle: { backgroundColor: tokens['surface.hover'] },
})

const Body = styled(Stack, {
  name: 'DrawerBody',
  flex: 1,
  padding: 18,
  gap: 12,
  overflow: 'scroll' as never,
})

const Footer = styled(Stack, {
  name: 'DrawerFooter',
  flexShrink: 0,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  padding: 18,
  borderTopWidth: 1,
  borderTopColor: tokens['border.default'],
})

type DrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  footer?: ReactNode
  closeLabel?: string
  children?: ReactNode
}

function Drawer({ open, onOpenChange, title, footer, closeLabel = 'Close', children }: DrawerProps) {
  if (!open) return null
  return createPortal(
    <DrawerLayer onClose={() => onOpenChange(false)} title={title} footer={footer} closeLabel={closeLabel}>
      {children}
    </DrawerLayer>,
    document.body,
  )
}

function DrawerLayer({ onClose, title, footer, closeLabel, children }: Omit<DrawerProps, 'open' | 'onOpenChange'> & { onClose: () => void }) {
  const titleId = useId()
  const ref = useRef<HTMLElement | null>(null)
  useEffect(ensureMotionStyles, [])
  useEscape(onClose)
  useFocusScope(ref, true)

  return (
    <Scrim
      {...domProps({
        onClick: (event: { target: unknown; currentTarget: unknown }) => {
          if (event.target === event.currentTarget) onClose()
        },
      })}
    >
      <Panel
        className="kairo-ui-slide"
        ref={ref as never}
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <Header>
          <Title id={titleId} tag="h2">
            {title}
          </Title>
          <CloseButton aria-label={closeLabel} data-kairo-close="" onPress={onClose}>
            <Icon name="x" size={14} color={tokens['text.tertiary']} />
          </CloseButton>
        </Header>
        <Body>{children}</Body>
        {footer && <Footer>{footer}</Footer>}
      </Panel>
    </Scrim>
  )
}

export { Drawer }
export type { DrawerProps }
