import {
  Component,
  signal,
  computed,
  inject,
  HostListener,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { SectionChildrenComponent } from './section/sections/sections';
import { DragDropService } from './services/drag-ndrop';
import { sortedFormItems } from './form-item-order';
import {
  flattenVisibleFormRows,
  flatRowTrackKey,
  type FlatFormRow,
  type FormItemLike,
} from './form-flatten';
import {
  FormVirtualRowComponent,
  type VirtualRowAction,
} from './form-virtual-row/form-virtual-row';
import { IndexedDbService } from './services/indexed-db.service';

// ── Types ─────────────────────────────────────────────────────────────────────
export type QuestionType = 'text' | 'checkbox';
export interface CheckboxOption {
  id: string;
  label: string;
}
export interface FormQuestion {
  id: string;
  type: QuestionType;
  title: string;
  options: CheckboxOption[];
}
export interface FormSection {
  id: string;
  type: 'section';
  title: string;
  collapsed: boolean;
  children: (FormQuestion | FormSection)[];
}
export type FormItem = (FormQuestion & { type: QuestionType }) | FormSection;
export interface FormPage {
  id: string;
  title: string;
  description: string;
  collapsed: boolean;
  items: FormItem[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 9);
}
function mkQuestion(): FormQuestion {
  return { id: uid(), type: 'text', title: '', options: [] };
}
function mkSection(): FormSection {
  return {
    id: uid(),
    type: 'section',
    title: 'New Section',
    collapsed: false,
    children: [mkQuestion()],
  };
}
function mkPage(n: number): FormPage {
  return { id: uid(), title: `Page ${n}`, description: '', collapsed: false, items: [] };
}
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/** Contiguous selection within one parent list (display order: questions first, sections last). */
export interface FormListSelection {
  pageId: string;
  parentPath: string[];
  anchorIndex: number;
  focusIndex: number;
}

function pathsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Section shell for copy/paste (no nested children). */
function sectionShellFrom(source: FormSection): FormSection {
  return {
    id: uid(),
    type: 'section',
    title: source.title,
    collapsed: false,
    children: [],
  };
}

function freshQuestionFrom(source: FormQuestion): FormQuestion {
  const q = clone(source);
  q.id = uid();
  if (q.options?.length) {
    q.options = q.options.map((o) => ({ ...o, id: uid(), label: o.label }));
  }
  return q;
}

function itemForPaste(item: FormItem): FormItem {
  if (item.type === 'section') return sectionShellFrom(item as FormSection);
  return freshQuestionFrom(item as FormQuestion);
}

// ── Component ─────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ScrollingModule, SectionChildrenComponent, FormVirtualRowComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  /** When visible flat rows ≥ threshold, use CDK virtual scroll (drag reorder disabled for that page). */
  readonly virtualScrollThreshold = 55;
  readonly virtualRowHeightPx = 88;

  /** Flattened visible rows per page (questions-first order, expanded sections inlined). */
  pageFlatRows = computed(() => {
    const map = new Map<string, FlatFormRow[]>();
    for (const p of this.pages()) {
      map.set(p.id, flattenVisibleFormRows(p.id, p.items as FormItemLike[], [], 0));
    }
    return map;
  });
  pages = signal<FormPage[]>([mkPage(1)]);
  editingPageId = signal('');
  openPageMenuId = signal('');
  /** Keyboard copy buffer (supports multiple items; sections are shells only). */
  internalClipboard = signal<FormItem[]>([]);
  /** Contiguous row selection for copy / paste anchor. */
  selection = signal<FormListSelection | null>(null);
  dnd = inject(DragDropService);
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  canUndo = computed(() => this.undoStack.length > 0);
  canRedo = computed(() => this.redoStack.length > 0);
  idb = inject(IndexedDbService);

  virtualRows(pageId: string): FlatFormRow[] {
    return this.pageFlatRows().get(pageId) ?? [];
  }
  async ngOnInit() {
    await this.idb.open();
    const saved = await this.idb.loadPages();
    if (saved?.length) this.pages.set(saved);
  }

  useVirtualForPage(pageId: string): boolean {
    return this.virtualRows(pageId).length >= this.virtualScrollThreshold;
  }

  async loadTestData() {
    const testPages = this.idb.generateTestData();
    this.pushUndo();
    this.pages.set(testPages);
    await this.idb.savePages(testPages);
  }

  trackFlatRow = (_: number, row: FlatFormRow) => flatRowTrackKey(row);

  onVirtualRowAction(a: VirtualRowAction) {
    switch (a.type) {
      case 'select': {
        const list = this.getListRef(a.pageId, a.parentPath);
        if (list)
          this.onListRowClick(
            a.pageId,
            a.parentPath,
            { itemId: a.itemId, shiftKey: a.shiftKey },
            list,
          );
        break;
      }
      case 'toggleCollapse':
        this.toggleCollapseAt(a.pageId, a.parentPath, a.id);
        break;
      case 'titleChange':
        this.updateTitleAt(a.pageId, a.parentPath, a.id, a.value);
        break;
      case 'typeChange':
        this.applyQuestionType(a.pageId, a.parentPath, a.id, a.value);
        break;
      case 'delete':
        this.deleteAt(a.pageId, a.parentPath, a.id);
        break;
      case 'addQuestion':
        this.addQuestionAt(a.pageId, a.parentPath, a.sectionId);
        break;
      case 'addSection':
        this.addSectionAt(a.pageId, a.parentPath, a.sectionId);
        break;
    }
  }

  applyQuestionType(pageId: string, parentPath: string[], itemId: string, type: string) {
    if (parentPath.length === 0) {
      this.setItemType(pageId, itemId, type as QuestionType);
    } else {
      this.setTypeAt(pageId, parentPath, itemId, type);
    }
  }

  // ── Undo/Redo ───────────────────────────────────────────────────────────────
  private snap() {
    return JSON.stringify(this.pages());
  }
  private pushUndo() {
    this.undoStack.push(this.snap());
    this.redoStack = [];
    this.idb.savePages(this.pages()).catch(console.error); // ← add this
  }
  undo() {
    const p = this.undoStack.pop();
    if (!p) return;
    this.redoStack.push(this.snap());
    this.pages.set(JSON.parse(p));
  }
  redo() {
    const n = this.redoStack.pop();
    if (!n) return;
    this.undoStack.push(this.snap());
    this.pages.set(JSON.parse(n));
  }

  // ── Page mutations ──────────────────────────────────────────────────────────
  private mutatePage(pageId: string, fn: (p: FormPage) => void) {
    this.pushUndo();
    this.pages.update((pages) => {
      const u = clone(pages);
      const p = u.find((p: FormPage) => p.id === pageId);
      if (p) fn(p);
      return u;
    });
  }

  addPage() {
    this.pushUndo();
    this.pages.update((ps) => [...ps, mkPage(ps.length + 1)]);
  }
  deletePage(pageId: string) {
    if (this.pages().length === 1) return; // keep at least 1
    this.pushUndo();
    this.pages.update((ps) => ps.filter((p) => p.id !== pageId));
  }
  togglePage(pageId: string) {
    this.pages.update((ps) => {
      const u = clone(ps);
      const p = u.find((p: FormPage) => p.id === pageId);
      if (p) p.collapsed = !p.collapsed;
      return u;
    });
  }
  togglePageMenu(pageId: string) {
    this.openPageMenuId.set(this.openPageMenuId() === pageId ? '' : pageId);
  }
  updatePageDescription(pageId: string, val: string) {
    this.pages.update((ps) => {
      const u = clone(ps);
      const p = u.find((p: FormPage) => p.id === pageId);
      if (p) p.description = val;
      return u;
    });
  }

  // ── Question / Section add ──────────────────────────────────────────────────
  addQuestion(pageId: string) {
    this.mutatePage(pageId, (p) => p.items.push({ ...mkQuestion(), type: 'text' } as FormItem));
  }
  addQuestionAfter(pageId: string, afterId: string) {
    this.mutatePage(pageId, (p) => {
      const idx = p.items.findIndex((i) => i.id === afterId);
      p.items.splice(idx + 1, 0, { ...mkQuestion(), type: 'text' } as FormItem);
    });
  }
  addSection(pageId: string) {
    this.mutatePage(pageId, (p) => p.items.push(mkSection() as unknown as FormItem));
  }

  // ── Nested section helpers ─────────────────────────────────────────────────
  addQuestionToSection(pageId: string, sectionId: string) {
    this.mutatePage(pageId, (p) => {
      const s = p.items.find((i) => i.id === sectionId) as FormSection | undefined;
      if (s) s.children.push(mkQuestion());
    });
  }
  addSectionInsideSection(pageId: string, sectionId: string) {
    this.mutatePage(pageId, (p) => {
      const s = p.items.find((i) => i.id === sectionId) as FormSection | undefined;
      if (s) s.children.push(mkSection()); // ← push a section, not a question
    });
  }

  toggleSection(pageId: string, sectionId: string) {
    this.pages.update((ps) => {
      const u = clone(ps);
      const p = u.find((p: FormPage) => p.id === pageId);
      const s = p?.items.find((i: FormItem) => i.id === sectionId) as FormSection | undefined;
      if (s) s.collapsed = !s.collapsed;
      return u;
    });
  }

  // ── Title updates ───────────────────────────────────────────────────────────
  updateItemTitle(pageId: string, itemId: string, val: string) {
    this.pages.update((ps) => {
      const u = clone(ps);
      const p = u.find((p: FormPage) => p.id === pageId);
      const item = p?.items.find((i: FormItem) => i.id === itemId);
      if (item) item.title = val;
      return u;
    });
  }

  updateChildTitle(pageId: string, sectionId: string, childId: string, val: string) {
    this.pages.update((pages) => {
      const u = clone(pages);
      const p = u.find((p: FormPage) => p.id === pageId);
      const s = p?.items.find((i: FormItem) => i.id === sectionId) as FormSection | undefined;
      const c = s?.children.find((c) => c.id === childId);
      if (c && c.type !== 'section') {
        // ← same guard
        c.title = val;
      }
      return u;
    });
  }
  // ── Type setters ────────────────────────────────────────────────────────────
  setItemType(pageId: string, itemId: string, type: QuestionType) {
    this.mutatePage(pageId, (p) => {
      const item = p.items.find((i) => i.id === itemId) as any;
      if (item) {
        item.type = type;
        if (type === 'checkbox' && !item.options?.length)
          item.options = [
            { id: uid(), label: 'Option 1' },
            { id: uid(), label: 'Option 2' },
          ];
      }
    });
  }

  setChildType(pageId: string, sectionId: string, childId: string, type: QuestionType) {
    this.mutatePage(pageId, (p) => {
      const s = p.items.find((i) => i.id === sectionId) as FormSection | undefined;
      const c = s?.children.find((c) => c.id === childId);
      if (c && c.type !== 'section') {
        // ← narrow: exclude FormSection
        c.type = type;
        if (type === 'checkbox' && !c.options?.length)
          c.options = [
            { id: uid(), label: 'Option 1' },
            { id: uid(), label: 'Option 2' },
          ];
      }
    });
  }

  toggleNestedSection(pageId: string, sectionId: string, nestedId: string) {
    this.pages.update((pages) => {
      const u = clone(pages);
      const p = u.find((p) => p.id === pageId);
      const s = p?.items.find((i) => i.id === sectionId) as FormSection | undefined;
      const nested = s?.children.find((c) => c.id === nestedId) as FormSection | undefined;
      if (nested) nested.collapsed = !nested.collapsed;
      return u;
    });
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  deleteItem(pageId: string, itemId: string) {
    this.mutatePage(pageId, (p) => {
      p.items = p.items.filter((i) => i.id !== itemId);
    });
  }

  deleteChild(pageId: string, sectionId: string, childId: string) {
    this.mutatePage(pageId, (p) => {
      const s = p.items.find((i) => i.id === sectionId) as FormSection | undefined;
      if (s) s.children = s.children.filter((c) => c.id !== childId);
    });
  }

  // ── Selection / keyboard copy–paste (Ctrl/Cmd+C, Ctrl/Cmd+V) ───────────────
  private typingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    return !!el.closest('input,textarea,select,[contenteditable="true"]');
  }

  private getListRef(pageId: string, parentPath: string[]): FormItem[] | undefined {
    const p = this.pages().find((x) => x.id === pageId);
    if (!p) return undefined;
    if (parentPath.length === 0) return p.items;
    return this.findSection(p.items, parentPath)?.children as FormItem[] | undefined;
  }

  /** Indices in `sel` refer to `sortedFormItems(list)` order. */
  private selectionSliceIds(sel: FormListSelection, displayOrdered: FormItem[]): string[] {
    const lo = Math.min(sel.anchorIndex, sel.focusIndex);
    const hi = Math.max(sel.anchorIndex, sel.focusIndex);
    return displayOrdered.slice(lo, hi + 1).map((i) => i.id);
  }

  sortedItems(items: FormItem[]): FormItem[] {
    return sortedFormItems(items);
  }

  isRowSelected(pageId: string, parentPath: string[], itemId: string): boolean {
    const sel = this.selection();
    if (!sel || sel.pageId !== pageId || !pathsEqual(sel.parentPath, parentPath)) return false;
    const list = this.getListRef(pageId, parentPath);
    if (!list) return false;
    const display = sortedFormItems(list);
    return this.selectionSliceIds(sel, display).includes(itemId);
  }

  onTopLevelRowClick(ev: MouseEvent, pageId: string, itemId: string, items: FormItem[]) {
    if (this.typingTarget(ev.target)) return;
    const t = ev.target as HTMLElement;
    if (t.closest('button')) return;
    this.onListRowClick(pageId, [], { itemId, shiftKey: ev.shiftKey }, items);
  }

  onListRowClick(
    pageId: string,
    parentPath: string[],
    ev: { itemId: string; shiftKey: boolean },
    list: FormItem[],
  ) {
    const display = sortedFormItems([...list]);
    const idx = display.findIndex((i) => i.id === ev.itemId);
    if (idx === -1) return;
    const cur = this.selection();
    if (!ev.shiftKey || !cur || cur.pageId !== pageId || !pathsEqual(cur.parentPath, parentPath)) {
      this.selection.set({ pageId, parentPath, anchorIndex: idx, focusIndex: idx });
      return;
    }
    this.selection.set({
      pageId,
      parentPath,
      anchorIndex: cur.anchorIndex,
      focusIndex: idx,
    });
  }

  private extendSelection(delta: number) {
    const sel = this.selection();
    if (!sel) return;
    const list = this.getListRef(sel.pageId, sel.parentPath);
    const display = list?.length ? sortedFormItems([...list]) : [];
    if (!display.length) return;
    const next = Math.min(display.length - 1, Math.max(0, sel.focusIndex + delta));
    this.selection.set({ ...sel, focusIndex: next });
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(e: KeyboardEvent) {
    if (this.typingTarget(e.target)) return;
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'ArrowDown' && e.shiftKey && !mod) {
      e.preventDefault();
      this.extendSelection(1);
      return;
    }
    if (e.key === 'ArrowUp' && e.shiftKey && !mod) {
      e.preventDefault();
      this.extendSelection(-1);
      return;
    }
    if (mod && (e.key === 'c' || e.key === 'C')) {
      const sel = this.selection();
      if (!sel || !this.getListRef(sel.pageId, sel.parentPath)) return;
      e.preventDefault();
      this.copySelectionToInternalClipboard();
      return;
    }
    if (mod && (e.key === 'v' || e.key === 'V')) {
      const sel = this.selection();
      if (!sel || this.internalClipboard().length === 0) return;
      e.preventDefault();
      this.pasteInternalClipboard();
    }
  }

  private copySelectionToInternalClipboard() {
    const sel = this.selection();
    if (!sel) return;
    const list = this.getListRef(sel.pageId, sel.parentPath);
    if (!list) return;
    const display = sortedFormItems([...list]);
    const lo = Math.min(sel.anchorIndex, sel.focusIndex);
    const hi = Math.max(sel.anchorIndex, sel.focusIndex);
    const items = display.slice(lo, hi + 1);
    const payload = items.map((item) =>
      item.type === 'section' ? sectionShellFrom(item as FormSection) : clone(item),
    ) as FormItem[];
    this.internalClipboard.set(payload);
  }

  private pasteInternalClipboard() {
    const sel = this.selection();
    const payload = this.internalClipboard();
    if (!sel || payload.length === 0) return;
    this.mutatePage(sel.pageId, (p) => {
      const list = this.getListRefFromPage(p, sel.parentPath);
      if (!list) return;
      const display = sortedFormItems([...list]);
      const hi = Math.max(sel.anchorIndex, sel.focusIndex);
      const lastId = display[hi]?.id;
      if (lastId === undefined) return;
      let insertAt = list.findIndex((i) => i.id === lastId);
      if (insertAt === -1) return;
      for (const template of payload) {
        const copy = itemForPaste(template);
        list.splice(insertAt + 1, 0, copy);
        insertAt++;
      }
    });
  }

  onNestedRowSelect(
    pageId: string,
    event: { itemId: string; shiftKey: boolean; parentPath: string[] },
  ) {
    const list = this.getListRef(pageId, event.parentPath);
    if (!list) return;
    this.onListRowClick(
      pageId,
      event.parentPath,
      { itemId: event.itemId, shiftKey: event.shiftKey },
      list,
    );
  }

  private getListRefFromPage(page: FormPage, parentPath: string[]): FormItem[] | undefined {
    if (parentPath.length === 0) return page.items;
    return this.findSection(page.items, parentPath)?.children as FormItem[] | undefined;
  }

  // ── Drag & Drop ─────────────────────────────────────────────────────────────
  private dragMeta: { pageId: string; itemId: string } | null = null;

  onChildDragStart(e: DragEvent, pageId: string, _sectionId: string, _childId: string) {
    // for now, just mark page – child reorder can be added next
    e.stopPropagation();
    this.dragMeta = { pageId, itemId: _sectionId };
  }

  updateGrandchildTitle(
    pageId: string,
    sectionId: string,
    nestedId: string,
    childId: string,
    val: string,
  ) {
    this.pages.update((pages) => {
      const u = clone(pages);
      const p = u.find((p: FormPage) => p.id === pageId);
      const s = p?.items.find((i: FormItem) => i.id === sectionId) as FormSection | undefined;
      const nested = s?.children.find((c) => c.id === nestedId) as FormSection | undefined;
      const child = nested?.children.find((c) => c.id === childId) as FormQuestion | undefined;
      if (child) child.title = val;
      return u;
    });
  }

  setGrandchildType(
    pageId: string,
    sectionId: string,
    nestedId: string,
    childId: string,
    type: QuestionType,
  ) {
    this.mutatePage(pageId, (p) => {
      const s = p.items.find((i) => i.id === sectionId) as FormSection | undefined;
      const nested = s?.children.find((c) => c.id === nestedId) as FormSection | undefined;
      const child = nested?.children.find((c) => c.id === childId) as FormQuestion | undefined;
      if (child) {
        child.type = type;
        if (type === 'checkbox' && !child.options?.length)
          child.options = [
            { id: uid(), label: 'Option 1' },
            { id: uid(), label: 'Option 2' },
          ];
      }
    });
  }

  deleteGrandchild(pageId: string, sectionId: string, nestedId: string, childId: string) {
    this.mutatePage(pageId, (p) => {
      const s = p.items.find((i) => i.id === sectionId) as FormSection | undefined;
      const nested = s?.children.find((c) => c.id === nestedId) as FormSection | undefined;
      if (nested) nested.children = nested.children.filter((c) => c.id !== childId);
    });
  }

  // Walks path[] to find the target section at any depth
  private findSection(items: FormItem[], path: string[]): FormSection | undefined {
    const [head, ...rest] = path;
    const node = items.find((i) => i.id === head) as FormSection | undefined;
    if (!node || node.type !== 'section') return undefined;
    if (rest.length === 0) return node;
    return this.findSection(node.children as FormItem[], rest);
  }

  // Add question at any depth
  addQuestionAt(pageId: string, path: string[], targetId: string) {
    this.mutatePage(pageId, (p) => {
      const section = this.findSection(p.items, [...path, targetId]);
      section?.children.push(mkQuestion());
    });
  }

  // Add section at any depth
  addSectionAt(pageId: string, path: string[], targetId: string) {
    this.mutatePage(pageId, (p) => {
      const section = this.findSection(p.items, [...path, targetId]);
      section?.children.push(mkSection());
    });
  }

  // Delete at any depth
  deleteAt(pageId: string, path: string[], targetId: string) {
    this.mutatePage(pageId, (p) => {
      if (path.length === 0) {
        // top-level item
        p.items = p.items.filter((i) => i.id !== targetId);
      } else {
        const parent = this.findSection(p.items, path);
        if (parent) parent.children = parent.children.filter((c) => c.id !== targetId);
      }
    });
  }

  // Update title at any depth
  updateTitleAt(pageId: string, path: string[], targetId: string, value: string) {
    this.pages.update((pages) => {
      const u = clone(pages);
      const p = u.find((p: FormPage) => p.id === pageId);
      if (!p) return u;
      if (path.length === 0) {
        const item = p.items.find((i: FormItem) => i.id === targetId);
        if (item) item.title = value;
      } else {
        const parent = this.findSection(p.items, path);
        const item = parent?.children.find((c) => c.id === targetId);
        if (item) item.title = value;
      }
      return u;
    });
  }

  // Toggle collapse at any depth
  toggleCollapseAt(pageId: string, path: string[], targetId: string) {
    this.pages.update((pages) => {
      const u = clone(pages);
      const p = u.find((p: FormPage) => p.id === pageId);
      if (!p) return u;
      const section = this.findSection(p.items, [...path, targetId]);
      if (section) section.collapsed = !section.collapsed;
      return u;
    });
  }

  setTypeAt(pageId: string, path: string[], targetId: string, type: string) {
    this.mutatePage(pageId, (p) => {
      if (path.length === 0) return;
      const parent = this.findSection(p.items, path);
      const item = parent?.children.find((c) => c.id === targetId) as any;
      if (item && item.type !== 'section') {
        item.type = type as QuestionType;
        if (item.type === 'checkbox' && !item.options?.length)
          item.options = [
            { id: uid(), label: 'Option 1' },
            { id: uid(), label: 'Option 2' },
          ];
      }
    });
  }

  // ── Top-level drag handlers (for page.items[]) ───────────────────────────────

  onDragStart(event: DragEvent, pageId: string, item: FormItem) {
    // Sections only draggable when collapsed
    if (item.type === 'section' && !(item as FormSection).collapsed) {
      event.preventDefault();
      return;
    }
    event.dataTransfer!.effectAllowed = 'move';
    event.dataTransfer!.setData('text/plain', item.id);

    this.dnd.startDrag({
      pageId,
      parentPath: [], // [] = top level of page.items[]
      itemId: item.id,
      itemType: item.type === 'section' ? 'section' : 'question',
    });
  }

  onDragOver(event: DragEvent, pageId: string, item: FormItem) {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
    this.dnd.setDropTarget({ pageId, parentPath: [], itemId: item.id });
  }

  onDragEnd() {
    this.dnd.endDrag();
  }

  onDrop(event: DragEvent, pageId: string, targetItem: FormItem) {
    event.preventDefault();
    const dragging = this.dnd.dragging();
    this.dnd.endDrag();

    if (!dragging || dragging.itemId === targetItem.id) return;
    if (dragging.pageId !== pageId) return;

    // Use the unified reorder handler — fromParentPath may be [] or a nested path
    this.onSectionChildReorder({
      pageId,
      fromParentPath: dragging.parentPath,
      fromId: dragging.itemId,
      toParentPath: [], // top level is always []
      toId: targetItem.id,
    });
  }

  // Helper used by both top-level drops and reorder events from SectionChildrenComponent
  reorderAt(pageId: string, parentPath: string[], fromId: string, toId: string) {
    this.mutatePage(pageId, (p) => {
      let list: (FormItem | FormQuestion | FormSection)[];

      if (parentPath.length === 0) {
        list = p.items;
      } else {
        const parent = this.findSection(p.items, parentPath);
        if (!parent) return;
        list = parent.children;
      }

      const fromIdx = list.findIndex((i) => i.id === fromId);
      const toIdx = list.findIndex((i) => i.id === toId);
      if (fromIdx === -1 || toIdx === -1) return;

      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
    });
  }

  // Called from (reorder) output of <app-section-children>
  onSectionChildReorder(event: {
    pageId: string;
    fromParentPath: string[];
    fromId: string;
    toParentPath: string[];
    toId: string;
  }) {
    this.mutatePage(event.pageId, (p) => {
      // 1. Find the source parent list
      const fromList =
        event.fromParentPath.length === 0
          ? p.items
          : (this.findSection(p.items, event.fromParentPath)?.children as FormItem[]);

      // 2. Find the target parent list
      const toList =
        event.toParentPath.length === 0
          ? p.items
          : (this.findSection(p.items, event.toParentPath)?.children as FormItem[]);

      if (!fromList || !toList) return;

      // 3. Pull the item out of the source list
      const fromIdx = fromList.findIndex((i) => i.id === event.fromId);
      if (fromIdx === -1) return;
      const [moved] = fromList.splice(fromIdx, 1);

      // 4. Insert it at the correct position in the target list
      const toIdx = toList.findIndex((i) => i.id === event.toId);
      if (toIdx === -1) {
        toList.push(moved); // fallback: append at end
      } else {
        toList.splice(toIdx, 0, moved);
      }
    });
  }

  // Convenience helpers for template class bindings
  isDraggingItem(pageId: string, itemId: string): boolean {
    return this.dnd.isDragging(pageId, [], itemId);
  }

  isDropTargetItem(pageId: string, itemId: string): boolean {
    return this.dnd.isDropTarget(pageId, [], itemId);
  }
}
