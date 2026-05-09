// Web implementation — HTML <table> elements styled via Tamagui tokens.
// <table> does not exist in React Native; Metro resolves table.native.tsx
// which exports lightweight stubs so shared code compiles on RN.

import { styled, Stack } from '@tamagui/core'
import type { ComponentProps } from 'react'

// ─── Container (scrollable wrapper) ──────────────────────────────────────────

const TableContainer = styled(Stack, {
  name: 'TableContainer',
  position: 'relative',
  width: '100%',
  // @ts-ignore — overflowX is valid CSS
  overflowX: 'auto',
})

// ─── Typed wrappers over native HTML elements ─────────────────────────────────
// Tamagui's styled() doesn't support <table>/<thead> etc., so we use
// lightweight function components that pass Tamagui theme values inline.

type TableProps = ComponentProps<'table'> & { style?: object }
type TheadProps = ComponentProps<'thead'> & { style?: object }
type TbodyProps = ComponentProps<'tbody'> & { style?: object }
type TfootProps = ComponentProps<'tfoot'> & { style?: object }
type TrProps    = ComponentProps<'tr'>    & { style?: object }
type ThProps    = ComponentProps<'th'>    & { style?: object }
type TdProps    = ComponentProps<'td'>    & { style?: object }
type CaptionProps = ComponentProps<'caption'> & { style?: object }

function Table({ style, ...props }: TableProps) {
  return (
    <TableContainer>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 14,
          captionSide: 'bottom',
          ...style,
        }}
        {...props}
      />
    </TableContainer>
  )
}

function TableHeader({ style, ...props }: TheadProps) {
  return <thead style={{ borderBottom: '1px solid var(--border)', ...style }} {...props} />
}

function TableBody({ style, ...props }: TbodyProps) {
  return <tbody style={style} {...props} />
}

function TableFooter({ style, ...props }: TfootProps) {
  return (
    <tfoot
      style={{
        borderTop: '1px solid var(--border)',
        fontWeight: 500,
        backgroundColor: 'rgba(0,0,0,0.02)',
        ...style,
      }}
      {...props}
    />
  )
}

function TableRow({ style, ...props }: TrProps) {
  return (
    <tr
      style={{
        borderBottom: '1px solid var(--border)',
        transition: 'background-color 0.15s',
        ...style,
      }}
      {...props}
    />
  )
}

function TableHead({ style, ...props }: ThProps) {
  return (
    <th
      style={{
        height: 40,
        padding: '0 8px',
        textAlign: 'left',
        verticalAlign: 'middle',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...props}
    />
  )
}

function TableCell({ style, ...props }: TdProps) {
  return (
    <td
      style={{
        padding: 8,
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...props}
    />
  )
}

function TableCaption({ style, ...props }: CaptionProps) {
  return (
    <caption
      style={{
        marginTop: 16,
        fontSize: 14,
        color: 'var(--color-secondary)',
        ...style,
      }}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
