import { sortedFormItems } from './form-item-order';

/** Minimal shape for section traversal (avoids importing from app.ts). */
type SectionLike = {
  type: 'section';
  title: string;
  collapsed: boolean;
  children: FormItemLike[];
  id: string;
};
export type FormItemLike =
  | { type: string; id: string; title: string }
  | SectionLike;

export interface FlatFormRow {
  pageId: string;
  /** Path to the parent list that contains `item` (empty = page root). */
  parentPath: string[];
  depth: number;
  item: FormItemLike;
}

/** One row per visible item; expanded sections recurse into children (sorted display order). */
export function flattenVisibleFormRows(
  pageId: string,
  items: FormItemLike[],
  parentPath: string[],
  depth: number,
): FlatFormRow[] {
  const out: FlatFormRow[] = [];
  for (const item of sortedFormItems(items)) {
    out.push({ pageId, parentPath, depth, item });
    if (item.type === 'section' && !(item as SectionLike).collapsed) {
      const sec = item as SectionLike;
      out.push(
        ...flattenVisibleFormRows(pageId, sec.children, [...parentPath, sec.id], depth + 1),
      );
    }
  }
  return out;
}

export function flatRowTrackKey(row: FlatFormRow): string {
  return `${row.pageId}::${row.parentPath.join('/')}::${row.item.id}`;
}
