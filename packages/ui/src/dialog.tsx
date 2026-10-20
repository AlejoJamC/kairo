import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { styled, Stack, Text } from '@tamagui/core'
import { tokens } from '@kairo/tokens'
import { Icon } from './icon'
import { px } from './lib/units'
import { domProps, useEscape, useFocusScope } from './lib/overlay'

// Modal surface for a focused task: blocks the page until completed or
// cancelled. Focus is trapped inside and returns to the trigger on close; esc
// and the close button close it, and a scrim press closes it only when there
// are no unsaved changes.

const Scrim = styled(Stack, {
  name: 'DialogScrim',
  position: 'fixed' as never,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 90,
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  backgroundColor: tokens['surface.scrim'],
})

const Panel = styled(Stack, {
  name: 'Dialog',
  width: '100%',
  maxHeight: '100%',
  overflow: 'hidden',
  backgroundColor: tokens['surface.panel'],
  borderWidth: 1,
  borderColor: tokens['border.default'],
  borderRadius: px(tokens['radius.dialog']),
  boxShadow: tokens['shadow.pop'],
  outlineWidth: 0,
})

const Header = styled(Stack, {
  name: 'DialogHeader',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  paddingVertical: 16,
  paddingHorizontal: 20,
})

const Title = styled(Text, {
  name: 'DialogTitle',
  fontSize: 16,
  fontWeight: '600',
  letterSpacing: -0.16,
  lineHeight: 21,
  color: tokens['text.primary'],
})

const CloseButton = styled(Stack, {
  name: 'DialogClose',
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
  name: 'DialogBody',
  paddingHorizontal: 20,
  paddingBottom: 20,
  gap: 12,
  overflow: 'scroll' as never,
})

const Footer = styled(Stack, {
  name: 'DialogFooter',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 8,
  paddingVertical: 12,
  paddingHorizontal: 20,
  backgroundColor: tokens['surface.sunken'],
  borderTopWidth: 1,
  borderTopColor: tokens['border.default'],
})

type DialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Right-aligned actions on the sunken footer. */
  footer?: ReactNode
  /** Unsaved changes: a scrim press no longer closes the dialog. */
  dirty?: boolean
  closeLabel?: string
  maxWidth?: number
  children?: ReactNode
}

function Dialog({ open, onOpenChange, title, footer, dirty, closeLabel = 'Close', maxWidth = 480, children }: DialogProps) {
  if (!open) return null
  return createPortal(
    <DialogLayer
      onClose={() => onOpenChange(false)}
      title={title}
      footer={footer}
      dirty={dirty}
      closeLabel={closeLabel}
      maxWidth={maxWidth}
    >
      {children}
    </DialogLayer>,
    document.body,
  )
}

type LayerProps = Omit<DialogProps, 'open' | 'onOpenChange'> & { onClose: () => void }

function DialogLayer({ onClose, title, footer, dirty, closeLabel, maxWidth, children }: LayerProps) {
  const titleId = useId()
  const ref = useRef<HTMLElement | null>(null)
  useEscape(onClose)
  useFocusScope(ref, true)

  return (
    <Scrim
      {...domProps({
        onClick: (event: { target: unknown; currentTarget: unknown }) => {
          if (event.target === event.currentTarget && !dirty) onClose()
        },
      })}
    >
      <Panel
        ref={ref as never}
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        tabIndex={-1}
        maxWidth={maxWidth}
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

export { Dialog }
export type { DialogProps }
