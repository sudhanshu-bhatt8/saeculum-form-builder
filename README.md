# saeculum-form-builder

A dynamic form builder built with Angular 19, featuring drag-and-drop reordering, nested collapsible sections, multi-page wizard-style forms, keyboard copy/paste, virtual scrolling for large forms, and IndexedDB persistence.

---

## Tech Stack

- **Framework**: Angular 19 (standalone components, signals)
- **Styling**: Tailwind CSS v4
- **UI Components**: Angular Material
- **Drag & Drop**: Angular CDK DragDrop
- **Virtual Scrolling**: Angular CDK ScrollingModule
- **Persistence**: Browser IndexedDB (client-side)
- **Language**: TypeScript

---

## Prerequisites

- Node.js 18 or higher
- npm 9 or higher
- Angular CLI 19

```bash
npm install -g @angular/cli
```

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/sudhanshu-bhatt/saeculum-form-builder.git
cd saeculum-form-builder
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the development server

```bash
ng serve
```

Open your browser at `http://localhost:4200`

---

## Features

### Pages (Wizard-style)

- Forms are split into multiple pages stacked vertically on the canvas
- Add pages using the **Add Page** button at the bottom of each page
- Collapse/expand pages using the chevron in the page header
- Delete pages via the 3-dot menu (minimum 1 page is always kept)

### Questions

- Add questions using the **+ Question** button or by pressing **Enter** inside any question input
- Supported types: **Text answer** and **Checkbox** — switchable via the dropdown in each row
- Delete questions using the trash icon (visible on hover)

### Sections

- Add sections using the **Section** button
- Sections are collapsible — click the chevron to expand/collapse
- Sections support **infinite nesting** — add sub-sections inside any section
- Add questions or sub-sections inside a section using the hover action buttons

### Drag & Drop

- **Top-level items** (questions and collapsed sections) can be freely dragged and reordered within a page using Angular CDK
- Sections can only be dragged **when collapsed** — this prevents accidental drags while editing
- Nested items use **up/down arrow buttons** (visible on hover) for reordering within a section

### Copy / Paste

- **Click** any question or section to select it (highlighted with a blue ring)
- **Shift + ↑ / ↓** to extend the selection to adjacent items (contiguous selection only, within the same parent)
- **Ctrl+C / Cmd+C** to copy selected items
- **Ctrl+V / Cmd+V** to paste directly below the selected item
- Paste is skipped if nothing is selected
- Items can be copied from one page and pasted into another
- Sections are copied as **shells only** (without nested children), per spec

### Undo / Redo

- **Ctrl+Z / Cmd+Z** — undo any action
- **Ctrl+Y / Cmd+Y** — redo
- Undo/redo buttons are also available in the toolbar
- Every mutation (add, delete, reorder, type change) is fully reversible

### Large Form Performance

- Forms with **55+ visible rows** automatically switch to **CDK Virtual Scrolling**
- Only visible rows are rendered — smooth performance with 1,000+ questions
- Use the **Load 1000 test questions** button in the toolbar to generate test data and verify performance

### IndexedDB Persistence

- All form data is automatically saved to the browser's IndexedDB on every change
- Data persists across page refreshes
- Use the **Clear All** button to reset to a blank form

---

## Project Structure

```
src/
├── app/
│   ├── app.ts                        # Root component — state, signals, all mutations
│   ├── app.html                      # Root template — page cards, top-level items
│   ├── app.scss
│   ├── form-flatten.ts               # Utility — flattens nested items for virtual scroll
│   ├── form-item-order.ts            # Utility — questions-first sort order
│   ├── section/
│   │   └── sections/
│   │       ├── sections.ts           # Recursive section children component
│   │       └── sections.html
│   ├── form-virtual-row/
│   │   └── form-virtual-row.ts       # Virtual scroll row component
│   └── services/
│       ├── indexed-db.service.ts     # IndexedDB open / save / load / clear
│       ├── drag-ndrop.ts             # Drag state service (top-level drag tracking)
│       └── ClipboardService/
│           └── clip-board.ts         # Selection, copy, paste logic
```

---

## Key Architectural Decisions

| Decision                               | Reason                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| Angular Signals (not NgRx)             | Simpler mental model, no subscribe/unsubscribe, computed() auto-derives canUndo/canRedo |
| Full JSON snapshot undo                | Simple and reliable — every action reversible with zero special-case code               |
| Deep clone on every mutation           | Prevents accidental state sharing between undo snapshots                                |
| Recursive `SectionChildrenComponent`   | Enables infinite nesting with a single reusable component                               |
| `path[]` system for nested mutations   | Breadcrumb trail of ancestor IDs allows finding and mutating any node at any depth      |
| CDK Virtual Scroll threshold (55 rows) | Balances render cost vs scroll feel — below threshold, native scroll is smoother        |
| IndexedDB over localStorage            | Handles large payloads (1000+ questions) without the 5MB localStorage limit             |

---

## Known Limitations

- **Cross-section drag and drop**: Angular CDK has a known limitation with nested `cdkDropList` inside `cdkDrag`. Dragging between different nested sections is not supported via CDK — up/down reorder buttons are provided as the alternative for nested items.

---

## Running Tests

```bash
ng test
```

---

## Building for Production

```bash
ng build --configuration production
```

Output is in the `dist/` directory.

---

## Browser Support

| Browser | Supported |
| ------- | --------- |
| Chrome  | ✅        |
| Firefox | ✅        |
| Edge    | ✅        |
| Safari  | ✅        |

---

## Submission

Repository: `saeculum-form-builder`  
Collaborator access granted to: `pratik@saeculumsolutions.com`
