import { useState } from 'react'
import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Avatar } from './avatar'
import { Button } from './button'
import { Box, Text } from './layout'
import { Skeleton } from './loading'
import { px } from './lib/units'

// The data table of a page: a card that scrolls horizontally, a label-style
// header and rows that open a record when a handler is given.

type DataTableColumn<Row> = {
  id: string
  header: string
  /** CSS grid track, for example "2.5fr" or "36px". */
  width: string
  render: (row: Row, state: { hovered: boolean }) => ReactNode
}

type DataTableProps<Row> = {
  columns: readonly DataTableColumn<Row>[]
  rows: readonly Row[]
  rowKey: (row: Row) => string
  onRowClick?: (row: Row) => void
  /** Rows that just arrived: tinted and faded in. */
  isNewRow?: (row: Row) => boolean
  /** Accessible name of the table. */
  label: string
  loading?: boolean
  error?: { message: string; retryLabel: string; onRetry: () => void }
  /** Shown when there are no rows. */
  emptyLabel: string
  minWidth?: number
}

const LABEL = { fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', color: tokens['text.tertiary'] } as const

function DataTable<Row>({ columns, rows, rowKey, onRowClick, isNewRow, label, loading, error, emptyLabel, minWidth = 820 }: DataTableProps<Row>) {
  const template = columns.map((column) => column.width).join(' ')
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  return (
    <Box
      overflowX="auto"
      borderWidth={1}
      borderStyle="solid"
      borderColor={tokens['border.default']}
      borderRadius={px(tokens['radius.card'])}
      backgroundColor={tokens['surface.panel']}
    >
      <Box role="table" aria-label={label} minWidth={minWidth}>
        <Box role="row" grid gridTemplateColumns={template} gap={12} paddingVertical={10} paddingHorizontal={18}>
          {columns.map((column) => (
            <Text key={column.id} role="columnheader" font="mono" {...LABEL}>
              {column.header}
            </Text>
          ))}
        </Box>
        {error ? (
          <Box alignItems="center" paddingVertical={32} borderTopWidth={1} borderStyle="solid" borderTopColor={tokens['border.default']}>
            <Text tag="div" display="block" textAlign="center" fontSize={13} color={tokens['color.bad-ink']} marginBottom={10}>
              {error.message}
            </Text>
            <Button variant="secondary" onPress={error.onRetry}>
              {error.retryLabel}
            </Button>
          </Box>
        ) : loading ? (
          [0, 1, 2, 3, 4, 5].map((index) => (
            <Box
              key={index}
              role="row"
              grid
              gridTemplateColumns={template}
              gap={12}
              alignItems="center"
              paddingVertical={12}
              paddingHorizontal={18}
              borderTopWidth={1}
              borderStyle="solid"
              borderTopColor={tokens['border.default']}
            >
              <Box display="flex" alignItems="center" gap={10}>
                <Box circle overflow="hidden">
                  <Skeleton width={32} height={32} />
                </Box>
                <Box flexGrow={1}>
                  <Skeleton height={11} width="60%" />
                  <Box marginTop={6}>
                    <Skeleton height={9} width="40%" />
                  </Box>
                </Box>
              </Box>
              {columns.slice(1).map((column) => (
                <Skeleton key={column.id} height={11} width="70%" />
              ))}
            </Box>
          ))
        ) : rows.length === 0 ? (
          <Box paddingVertical={32} borderTopWidth={1} borderStyle="solid" borderTopColor={tokens['border.default']}>
            <Text tag="div" display="block" textAlign="center" fontSize={13} color={tokens['text.tertiary']}>
              {emptyLabel}
            </Text>
          </Box>
        ) : (
          rows.map((row) => {
            const key = rowKey(row)
            const hovered = hoveredKey === key
            const fresh = isNewRow?.(row) ?? false
            return (
              <Box
                key={key}
                role="row"
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onMouseEnter={() => setHoveredKey(key)}
                onMouseLeave={() => setHoveredKey(null)}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onRowClick(row)
                        }
                      }
                    : undefined
                }
                grid
                gridTemplateColumns={template}
                gap={12}
                alignItems="center"
                paddingVertical={12}
                paddingHorizontal={18}
                borderTopWidth={1}
                borderStyle="solid"
                borderTopColor={tokens['border.default']}
                cursor={onRowClick ? 'pointer' : 'default'}
                backgroundColor={hovered && onRowClick ? tokens['surface.hover'] : fresh ? tokens['accent.soft'] : 'transparent'}
                transition="background 0.1s"
                fadeIn={fresh}
              >
                {columns.map((column) => (
                  <Text key={column.id} tag="div" role="cell" display="block" minWidth={0} fontSize={13}>
                    {column.render(row, { hovered })}
                  </Text>
                ))}
              </Box>
            )
          })
        )}
      </Box>
    </Box>
  )
}

type DataTableMainCellProps = {
  name: string
  /** Seed for the avatar color. */
  seed: string
  /** Mono sub-line. */
  sub?: string
  /** Draft badge or similar, after the name. */
  badge?: ReactNode
}

function DataTableMainCell({ name, seed, sub, badge }: DataTableMainCellProps) {
  return (
    <Box display="flex" alignItems="center" gap={10} minWidth={0}>
      <Avatar name={name} seed={seed} size={32} />
      <Box minWidth={0} flexGrow={1} flexShrink={1} flexBasis="0%">
        <Box display="flex" alignItems="center" gap={6}>
          <Text fontWeight={500} color={tokens['text.primary']} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
            {name}
          </Text>
          {badge}
        </Box>
        {sub && (
          <Text tag="div" display="block" font="mono" fontSize={11} color={tokens['text.tertiary']} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
            {sub}
          </Text>
        )}
      </Box>
    </Box>
  )
}

export { DataTable, DataTableMainCell }
export type { DataTableProps, DataTableColumn, DataTableMainCellProps }
