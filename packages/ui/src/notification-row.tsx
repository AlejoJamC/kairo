import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Box, Pressable, Text } from './layout'

// One entry in the activity popover: an event with a dot, or a mention with an
// avatar and an excerpt. Rows are buttons.

type NotificationRowProps =
  | {
      variant: 'activity'
      who: string
      what: string
      /** Mono target in accent, for example KAI-101. */
      target?: string
      time: string
      unread?: boolean
      /** Color of the 7px event dot. */
      dotColor?: string
      onPress: () => void
    }
  | {
      variant: 'mention'
      avatar: ReactNode
      /** "[name] mentioned you in [target]". */
      text: ReactNode
      excerpt?: string
      time: string
      unread?: boolean
      onPress: () => void
    }

function NotificationRow(props: NotificationRowProps) {
  return (
    <Pressable
      onClick={props.onPress}
      display="flex"
      alignItems="flex-start"
      gap={10}
      width="100%"
      paddingVertical={10}
      paddingHorizontal={14}
      textAlign="left"
      hoverStyle={{ backgroundColor: tokens['surface.hover'] }}
    >
      {props.variant === 'mention' ? (
        <>
          <Box flexShrink={0}>{props.avatar}</Box>
          <Box flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0}>
            <Text tag="div" display="block" fontSize={12.5} color={tokens['text.primary']}>
              {props.text}
            </Text>
            {props.excerpt && (
              <Text tag="div" display="block" marginTop={4} paddingVertical={4} paddingHorizontal={7} borderRadius={5} fontSize={12} color={tokens['notes.text']} backgroundColor={tokens['notes.background']} lineClamp={2}>
                {props.excerpt}
              </Text>
            )}
          </Box>
        </>
      ) : (
        <>
          <Box width={7} height={7} flexShrink={0} marginTop={5} borderRadius={999} backgroundColor={props.dotColor ?? tokens['accent.default']} aria-hidden />
          <Text flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0} fontSize={12.5} color={tokens['text.secondary']}>
            <Text fontWeight={500} color={tokens['text.primary']}>
              {props.who}
            </Text>{' '}
            {props.what}
            {props.target && (
              <>
                {' '}
                <Text font="mono" fontSize={11} color={tokens['accent.ink']}>
                  {props.target}
                </Text>
              </>
            )}
          </Text>
        </>
      )}
      <Box display="flex" alignItems="center" gap={6} flexShrink={0}>
        <Text font="mono" fontSize={10.5} color={tokens['text.tertiary']}>
          {props.time}
        </Text>
        {props.unread && <Box width={6} height={6} borderRadius={999} backgroundColor={tokens['accent.default']} aria-hidden />}
      </Box>
    </Pressable>
  )
}

export { NotificationRow }
export type { NotificationRowProps }
