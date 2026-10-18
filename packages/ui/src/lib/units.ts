/** Token dimensions are CSS strings ("17px"); Tamagui styles take numbers. */
export function px(value: string): number {
  return Number.parseFloat(value)
}
