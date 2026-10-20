import { Fragment } from 'react'
import { tokens } from '@kairo/tokens'
import { Icon } from './icon'
import { Box, Text } from './layout'

// The plan comparison table: sticky header, group rows in the label style, a
// feature column in text.secondary and mono values. A real <table> with scope.

type PricingCell = string | boolean

type PricingRow = { id: string; feature: string; values: readonly PricingCell[] }
type PricingGroup = { id: string; title: string; rows: readonly PricingRow[] }

type PricingTableProps = {
  /** Plan names, one per value column. */
  plans: readonly string[]
  groups: readonly PricingGroup[]
  /** Index of the recommended column. */
  recommended?: number
  /** Screen-reader label of the first (empty) header cell. */
  featureLabel: string
  /** Accessible names of the check and the dash. */
  includedLabel: string
  notIncludedLabel: string
  caption?: string
}

const cell = (display: string) => ({ display: display as never })

const HIDDEN = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 } as const

function Value({ value, includedLabel, notIncludedLabel }: { value: PricingCell; includedLabel: string; notIncludedLabel: string }) {
  if (value === true) return <Icon name="check" size={15} color={tokens['color.ok']} label={includedLabel} />
  if (value === false) return <Text aria-label={notIncludedLabel} color={tokens['text.tertiary']}>—</Text>
  return (
    <Text font="mono" fontSize={13} color={tokens['text.primary']}>
      {value}
    </Text>
  )
}

function PricingTable({ plans, groups, recommended, featureLabel, includedLabel, notIncludedLabel, caption }: PricingTableProps) {
  const columns = plans.length + 1
  return (
    <Box overflowX="auto">
      <Box tag="table" minWidth={760} width="100%" {...cell('table')}>
        {caption && (
          <Text tag="caption" {...HIDDEN}>
            {caption}
          </Text>
        )}
        <Box tag="thead" {...cell('table-header-group')}>
          <Box tag="tr" {...cell('table-row')}>
            <Text tag="th" scope="col" width="32%" paddingVertical={14} paddingHorizontal={12} textAlign="left" sticky top={0} {...cell('table-cell')} backgroundColor={tokens['surface.page']}>
              <Text {...HIDDEN}>{featureLabel}</Text>
            </Text>
            {plans.map((plan, index) => (
              <Text
                key={plan}
                tag="th"
                scope="col"
                paddingVertical={14}
                paddingHorizontal={12}
                textAlign="left"
                sticky
                top={0}
                {...cell('table-cell')}
                fontSize={14}
                fontWeight={600}
                color={tokens['text.primary']}
                backgroundColor={index === recommended ? tokens['accent.soft'] : tokens['surface.page']}
              >
                {plan}
              </Text>
            ))}
          </Box>
        </Box>
        <Box tag="tbody" {...cell('table-row-group')}>
          {groups.map((group) => (
            <Fragment key={group.id}>
              <Box tag="tr" {...cell('table-row')}>
                <Text
                  tag="th"
                  scope="row"
                  colSpan={columns}
                  {...cell('table-cell')}
                  paddingTop={24}
                  paddingBottom={8}
                  paddingHorizontal={12}
                  textAlign="left"
                  font="mono"
                  fontSize={10.5}
                  fontWeight={400}
                  letterSpacing={0.6}
                  textTransform="uppercase"
                  color={tokens['text.tertiary']}
                >
                  {group.title}
                </Text>
              </Box>
              {group.rows.map((row) => (
                <Box key={row.id} tag="tr" {...cell('table-row')}>
                  <Text
                    tag="th"
                    scope="row"
                    {...cell('table-cell')}
                    paddingVertical={12}
                    paddingHorizontal={12}
                    textAlign="left"
                    fontSize={14}
                    fontWeight={400}
                    color={tokens['text.secondary']}
                    borderTopWidth={1}
                    borderStyle="solid"
                    borderTopColor={tokens['border.default']}
                  >
                    {row.feature}
                  </Text>
                  {row.values.map((value, index) => (
                    <Text
                      key={plans[index]}
                      tag="td"
                      {...cell('table-cell')}
                      paddingVertical={12}
                      paddingHorizontal={12}
                      borderTopWidth={1}
                      borderStyle="solid"
                      borderTopColor={tokens['border.default']}
                      backgroundColor={index === recommended ? tokens['accent.soft'] : 'transparent'}
                    >
                      <Value value={value} includedLabel={includedLabel} notIncludedLabel={notIncludedLabel} />
                    </Text>
                  ))}
                </Box>
              ))}
            </Fragment>
          ))}
        </Box>
      </Box>
    </Box>
  )
}

export { PricingTable }
export type { PricingTableProps, PricingGroup, PricingRow, PricingCell }
