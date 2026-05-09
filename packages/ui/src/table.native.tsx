// React Native stub — resolved by Metro instead of table.tsx.
// HTML <table> elements don't exist in RN. Apps that need tabular data
// on RN should implement a FlatList-based table at the app level.
// These stubs export the same component names so shared imports compile;
// they render nothing and log a warning in dev mode.

import type { ReactNode } from 'react'

const warn = (name: string) => {
  if (__DEV__) console.warn(`[kairo/ui] ${name} is a web-only component. Use a FlatList on React Native.`)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const noop = (name: string) => (_props: { children?: ReactNode; [k: string]: unknown }) => {
  warn(name)
  return null
}

const Table        = noop('Table')
const TableHeader  = noop('TableHeader')
const TableBody    = noop('TableBody')
const TableFooter  = noop('TableFooter')
const TableHead    = noop('TableHead')
const TableRow     = noop('TableRow')
const TableCell    = noop('TableCell')
const TableCaption = noop('TableCaption')

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
