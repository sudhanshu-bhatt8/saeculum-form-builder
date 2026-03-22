import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { FlatFormRow } from '../form-flatten';

export type VirtualRowAction =
  | { type: 'select'; pageId: string; parentPath: string[]; itemId: string; shiftKey: boolean }
  | { type: 'toggleCollapse'; pageId: string; parentPath: string[]; id: string }
  | { type: 'titleChange'; pageId: string; parentPath: string[]; id: string; value: string }
  | { type: 'typeChange'; pageId: string; parentPath: string[]; id: string; value: string }
  | { type: 'delete'; pageId: string; parentPath: string[]; id: string }
  | { type: 'addQuestion'; pageId: string; parentPath: string[]; sectionId: string }
  | { type: 'addSection'; pageId: string; parentPath: string[]; sectionId: string };

type SectionVm = { type: 'section'; title: string; id: string; collapsed: boolean };
type QuestionVm = { type: string; title: string; id: string };

@Component({
  selector: 'app-form-virtual-row',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './form-virtual-row.html',
  styleUrl: './form-virtual-row.scss',
})
export class FormVirtualRowComponent {
  @Input({ required: true }) row!: FlatFormRow;
  @Input() selected = false;
  @Input() virtualMode = true;
  @Output() rowAction = new EventEmitter<VirtualRowAction>();

  asSection(item: FlatFormRow['item']): SectionVm {
    return item as SectionVm;
  }

  asQuestion(item: FlatFormRow['item']): QuestionVm {
    return item as QuestionVm;
  }

  onSelect(ev: MouseEvent, itemId: string) {
    const t = ev.target as HTMLElement;
    if (t.closest('input,select,textarea,button')) return;
    this.rowAction.emit({
      type: 'select',
      pageId: this.row.pageId,
      parentPath: this.row.parentPath,
      itemId,
      shiftKey: ev.shiftKey,
    });
  }
}
