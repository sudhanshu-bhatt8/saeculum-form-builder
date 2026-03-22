/** Display order: non-section items first, then sections (bottom). */
export function sortedFormItems<T extends { type: string }>(items: T[]): T[] {
  return [...items.filter((i) => i.type !== 'section'), ...items.filter((i) => i.type === 'section')];
}
