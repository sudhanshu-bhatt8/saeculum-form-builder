import { Component, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SectionChildrenComponent } from './section/sections/sections';
import { DragDropService } from './services/drag-ndrop';

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

// ── Component ─────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-root',
  imports: [FormsModule, SectionChildrenComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  pages = signal<FormPage[]>([mkPage(1)]);
  editingPageId = signal('');
  openPageMenuId = signal('');
  clipboard = signal<FormItem | null>(null);
  dnd = inject(DragDropService);
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  canUndo = computed(() => this.undoStack.length > 0);
  canRedo = computed(() => this.redoStack.length > 0);

  // ── Undo/Redo ───────────────────────────────────────────────────────────────
  private snap() {
    return JSON.stringify(this.pages());
  }
  private pushUndo() {
    this.undoStack.push(this.snap());
    this.redoStack = [];
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

  // ── Copy/Paste ──────────────────────────────────────────────────────────────
  copyItem(pageId: string, itemId: string) {
    const page = this.pages().find((p) => p.id === pageId);
    const item = page?.items.find((i) => i.id === itemId);
    if (item) this.clipboard.set(clone(item));
  }
  paste() {
    const item = this.clipboard();
    if (!item) return;
    const lastPage = this.pages()[this.pages().length - 1];
    const copy = { ...clone(item), id: uid() };
    this.mutatePage(lastPage.id, (p) => p.items.push(copy as FormItem));
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

  // ─────────────────────────────────────────────────────────────────────────────
  // ADD THESE TO app.ts
  // ─────────────────────────────────────────────────────────────────────────────

  // 1. Inject DragDropService at the top of the class:
  //    dnd = inject(DragDropService);
  //
  // 2. Add these imports at the top of the file:
  //    import { inject } from '@angular/core';
  //    import { DragDropService } from './section/drag-drop.service';

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

    // Must be same page and same parent (top level)
    if (dragging.pageId !== pageId || dragging.parentPath.length !== 0) return;

    this.reorderAt(pageId, [], dragging.itemId, targetItem.id);
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
    parentPath: string[];
    fromId: string;
    toId: string;
  }) {
    this.reorderAt(event.pageId, event.parentPath, event.fromId, event.toId);
  }

  // Convenience helpers for template class bindings
  isDraggingItem(pageId: string, itemId: string): boolean {
    return this.dnd.isDragging(pageId, [], itemId);
  }

  isDropTargetItem(pageId: string, itemId: string): boolean {
    return this.dnd.isDropTarget(pageId, [], itemId);
  }
}
