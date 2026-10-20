import { useEffect } from 'react'
import { tokens } from '@kairo/tokens'
import { Icon } from './icon'
import { Box, Text } from './layout'
import { ensureMotionStyles } from './lib/motion-css'

// Frequently asked questions. Native disclosure (<details>): no script needed.
// The plus icon rotates 45° when open.

type FaqItem = { id: string; question: string; answer: string }

type FaqProps = { items: readonly FaqItem[] }

function Faq({ items }: FaqProps) {
  useEffect(ensureMotionStyles, [])
  return (
    <Box borderBottomWidth={1} borderStyle="solid" borderBottomColor={tokens['border.default']}>
      {items.map((item) => (
        <Box key={item.id} tag="details" className="kairo-ui-faq" borderTopWidth={1} borderStyle="solid" borderTopColor={tokens['border.default']}>
          <Box
            tag="summary"
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            gap={16}
            height={60}
            cursor="pointer"
            listStyle="none"
          >
            <Text fontSize={15.5} fontWeight={500} color={tokens['text.primary']}>
              {item.question}
            </Text>
            <Icon name="plus" size={18} color={tokens['text.tertiary']} />
          </Box>
          <Text tag="p" display="block" margin={0} paddingBottom={20} fontSize={14.5} lineHeightRatio={1.65} color={tokens['text.secondary']}>
            {item.answer}
          </Text>
        </Box>
      ))}
    </Box>
  )
}

export { Faq }
export type { FaqProps, FaqItem }
