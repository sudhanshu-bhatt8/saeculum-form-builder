import {
  Component,
  Input,
  Output,
  EventEmitter,
  forwardRef,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ScrollingModule } from '@angular/cdk/scrolling';
import type { FormQuestion, FormSection, FormListSelection } from '../../app';
import { DragDropService } from '../../services/drag-ndrop';
import { sortedFormItems } from '../../form-item-order';
import type { FlatFormRow, FormItemLike } from '../../form-flatten';
import { flatRowTrackKey } from '../../form-flatten';
import { FormVirtualRowComponent, type VirtualRowAction } from '../../form-virtual-row/form-virtual-row';

@Component({
  selector: 'app-section-children',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ScrollingModule,
    FormVirtualRowComponent,
    forwardRef(() => SectionChildrenComponent),
  ],
  templateUrl: './sections.html',
  styleUrl: './sections.scss',
})
export class SectionChildrenComponent {
  @Input() items: (FormQuestion | FormSection)[] = [];
  @Input() depth = 1;
  @Input() path: string[] = [];
  @Input() pageId = '';
  @Input() listSelection: FormListSelection | null = null;

  @Output() addQuestion = new EventEmitter<{ id: string; path: string[] }>();
  @Output() addSection = new EventEmitter<{ id: string; path: string[] }>();
  @Output() deleteItem = new EventEmitter<{ id: string; path: string[] }>();
  @Output() titleChange = new EventEmitter<{ id: string; value: string; path: string[] }>();
  @Output() typeChange = new EventEmitter<{ id: string; value: string; path: string[] }>();
  @Output() toggleCollapse = new EventEmitter<{ id: string; path: string[] }>();
  @Output() reorder = new EventEmitter<{
    pageId: string;
    fromParentPath: string[]; // where it was dragged FROM
    fromId: string;
    toParentPath: string[]; // where it's being dropped TO
    toId: string;
  }>();
  @Output() selectRows = new EventEmitter<{ itemId: string; shiftKey: boolean }>();

  dnd = inject(DragDropService);

  /** Questions first, sections last (matches parent selection indices). */
  readonly sortItems = sortedFormItems;
  readonly virtualScrollThreshold = 55;
  readonly virtualRowHeightPx = 88;

  /** Virtual scroll only when every row is a question (fixed-height rows + selection path matches `path`). */
  useVirtualQuestionList(): boolean {
    return (
      this.items.length >= this.virtualScrollThreshold &&
      this.items.every((i) => i.type !== 'section')
    );
  }

  questionOnlyFlatRows(): FlatFormRow[] {
    return sortedFormItems(this.items).map((item) => ({
      pageId: this.pageId,
      parentPath: this.path,
      depth: this.depth,
      item: item as FormItemLike,
    }));
  }

  trackQuestionFlatRow = (_: number, row: FlatFormRow) => flatRowTrackKey(row);

  onQuestionVirtualAction(a: VirtualRowAction) {
    switch (a.type) {
      case 'select':
        this.selectRows.emit({ itemId: a.itemId, shiftKey: a.shiftKey });
        break;
      case 'toggleCollapse':
        break;
      case 'titleChange':
        this.titleChange.emit({ id: a.id, value: a.value, path: a.parentPath });
        break;
      case 'typeChange':
        this.typeChange.emit({ id: a.id, value: a.value, path: a.parentPath });
        break;
      case 'delete':
        this.deleteItem.emit({ id: a.id, path: a.parentPath });
        break;
      case 'addQuestion':
      case 'addSection':
        break;
    }
  }

  buildPath(path: string[], id: string): string[] {
    return path.concat(id);
  }

  private pathsEq(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }

  private typingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    return !!el.closest('input,textarea,select,[contenteditable="true"]');
  }

  isRowSelected(itemId: string): boolean {
    const s = this.listSelection;
    if (!s || s.pageId !== this.pageId || !this.pathsEq(s.parentPath, this.path)) return false;
    const display = sortedFormItems([...this.items]);
    const lo = Math.min(s.anchorIndex, s.focusIndex);
    const hi = Math.max(s.anchorIndex, s.focusIndex);
    return display.slice(lo, hi + 1).some((i) => i.id === itemId);
  }

  onSelectableClick(ev: MouseEvent, itemId: string) {
    if (this.typingTarget(ev.target)) return;
    const t = ev.target as HTMLElement;
    if (t.closest('button')) return;
    this.selectRows.emit({ itemId, shiftKey: ev.shiftKey });
  }

  // ── Drag handlers ───────────────────────────────────────────────────────────

  onDragStart(event: DragEvent, item: FormQuestion | FormSection) {
    if (item.type === 'section' && !(item as FormSection).collapsed) {
      event.preventDefault();
      return;
    }
    event.stopPropagation();
    event.dataTransfer!.effectAllowed = 'move';
    event.dataTransfer!.setData('text/plain', item.id);

    this.dnd.startDrag({
      pageId: this.pageId,
      parentPath: this.path,
      itemId: item.id,
      itemType: item.type === 'section' ? 'section' : 'question',
    });
  }

  onDragOver(event: DragEvent, item: FormQuestion | FormSection) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer!.dropEffect = 'move';
    this.dnd.setDropTarget({
      pageId: this.pageId,
      parentPath: this.path,
      itemId: item.id,
    });
  }

  onDragLeave(event: DragEvent) {
    const related = event.relatedTarget as HTMLElement | null;
    if (!related) this.dnd.setDropTarget(null);
  }

  onDrop(event: DragEvent, targetItem: FormQuestion | FormSection) {
    event.preventDefault();
    event.stopPropagation();

    const dragging = this.dnd.dragging();
    this.dnd.endDrag();

    if (!dragging || dragging.itemId === targetItem.id) return;
    if (dragging.pageId !== this.pageId) return; // still block cross-PAGE drops

    // Sections can't be dropped INTO themselves
    if (targetItem.type === 'section' && dragging.itemId === targetItem.id) return;

    this.reorder.emit({
      pageId: this.pageId,
      fromParentPath: dragging.parentPath, // where it came from
      fromId: dragging.itemId,
      toParentPath: this.path, // where we are now
      toId: targetItem.id,
    });
  }

  onDragEnd() {
    this.dnd.endDrag();
  }

  isDragging(item: FormQuestion | FormSection): boolean {
    return this.dnd.isDragging(this.pageId, this.path, item.id);
  }

  isDropTarget(item: FormQuestion | FormSection): boolean {
    return this.dnd.isDropTarget(this.pageId, this.path, item.id);
  }
}
