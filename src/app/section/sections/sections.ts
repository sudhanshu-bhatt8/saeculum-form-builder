import { Component, Input, Output, EventEmitter, forwardRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormQuestion, FormSection } from '../../app';
import { DragDropService } from '../../services/drag-ndrop';

@Component({
  selector: 'app-section-children',
  standalone: true,
  imports: [FormsModule, forwardRef(() => SectionChildrenComponent)],
  templateUrl: './sections.html',
  styleUrl: './sections.scss',
})
export class SectionChildrenComponent {
  @Input() items: (FormQuestion | FormSection)[] = [];
  @Input() depth = 1;
  @Input() path: string[] = [];
  @Input() pageId = '';

  @Output() addQuestion = new EventEmitter<{ id: string; path: string[] }>();
  @Output() addSection = new EventEmitter<{ id: string; path: string[] }>();
  @Output() deleteItem = new EventEmitter<{ id: string; path: string[] }>();
  @Output() titleChange = new EventEmitter<{ id: string; value: string; path: string[] }>();
  @Output() typeChange = new EventEmitter<{ id: string; value: string; path: string[] }>();
  @Output() toggleCollapse = new EventEmitter<{ id: string; path: string[] }>();
  @Output() reorder = new EventEmitter<{
    pageId: string;
    parentPath: string[];
    fromId: string;
    toId: string;
  }>();

  dnd = inject(DragDropService);

  buildPath(path: string[], id: string): string[] {
    return path.concat(id);
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

    // Only reorder within the same parent container
    if (
      dragging.pageId !== this.pageId ||
      JSON.stringify(dragging.parentPath) !== JSON.stringify(this.path)
    )
      return;

    this.reorder.emit({
      pageId: this.pageId,
      parentPath: this.path,
      fromId: dragging.itemId,
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
