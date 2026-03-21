import { Injectable, signal } from '@angular/core';

export interface DragContext {
  pageId: string;
  parentPath: string[];
  itemId: string;
  itemType: 'question' | 'section';
}

export interface DropTarget {
  pageId: string;
  parentPath: string[];
  itemId: string; // the item we are hovering over
}

@Injectable({ providedIn: 'root' })
export class DragDropService {
  // What is being dragged right now
  dragging = signal<DragContext | null>(null);

  // Which item slot is currently highlighted as a drop target
  dropTarget = signal<DropTarget | null>(null);

  startDrag(ctx: DragContext) {
    this.dragging.set(ctx);
    this.dropTarget.set(null);
  }

  setDropTarget(target: DropTarget | null) {
    this.dropTarget.set(target);
  }

  endDrag() {
    this.dragging.set(null);
    this.dropTarget.set(null);
  }

  isDragging(pageId: string, parentPath: string[], itemId: string): boolean {
    const d = this.dragging();
    return (
      !!d &&
      d.pageId === pageId &&
      d.itemId === itemId &&
      JSON.stringify(d.parentPath) === JSON.stringify(parentPath)
    );
  }

  isDropTarget(pageId: string, parentPath: string[], itemId: string): boolean {
    const t = this.dropTarget();
    return (
      !!t &&
      t.pageId === pageId &&
      t.itemId === itemId &&
      JSON.stringify(t.parentPath) === JSON.stringify(parentPath)
    );
  }
}
