import { Injectable } from '@angular/core';
import { FormPage } from '../app';

const DB_NAME = 'form-builder-db';
const DB_VERSION = 1;
const STORE_NAME = 'forms';
const FORM_KEY = 'main-form'; // single form stored under this key

@Injectable({ providedIn: 'root' })
export class IndexedDbService {
  private db: IDBDatabase | null = null;

  // ── Open / init ────────────────────────────────────────────────────────────

  async open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME); // key-value store, no keyPath
        }
      };

      req.onsuccess = (e) => {
        this.db = (e.target as IDBOpenDBRequest).result;
        resolve();
      };

      req.onerror = () => reject(req.error);
    });
  }

  // ── Save pages ─────────────────────────────────────────────────────────────

  async savePages(pages: FormPage[]): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(pages, FORM_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // ── Load pages ─────────────────────────────────────────────────────────────

  async loadPages(): Promise<FormPage[] | null> {
    if (!this.db) return null;
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(FORM_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  // ── Clear (for testing) ────────────────────────────────────────────────────

  async clearAll(): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // ── Generate 1000 test questions across pages ──────────────────────────────
  // Call this to seed data for virtual scroll / performance testing

  generateTestData(): FormPage[] {
    const uid = () => Math.random().toString(36).slice(2, 9);

    const pages: FormPage[] = [];
    const questionsPerPage = 250; // 4 pages × 250 = 1000 questions
    const totalPages = 4;

    for (let pi = 0; pi < totalPages; pi++) {
      const items = [];

      // Add some sections with questions inside
      for (let si = 0; si < 5; si++) {
        const sectionChildren = [];
        for (let qi = 0; qi < 10; qi++) {
          sectionChildren.push({
            id: uid(),
            type: 'text' as const,
            title: `Page ${pi + 1} · Section ${si + 1} · Q${qi + 1}`,
            options: [],
          });
        }
        items.push({
          id: uid(),
          type: 'section' as const,
          title: `Section ${si + 1}`,
          collapsed: false,
          children: sectionChildren,
        });
      }

      // Fill remaining with top-level questions
      const topLevelCount = questionsPerPage - 50; // 50 already in sections
      for (let qi = 0; qi < topLevelCount; qi++) {
        items.push({
          id: uid(),
          type: (qi % 5 === 0 ? 'checkbox' : 'text') as any,
          title: `Page ${pi + 1} · Question ${qi + 1}`,
          options:
            qi % 5 === 0
              ? [
                  { id: uid(), label: 'Option A' },
                  { id: uid(), label: 'Option B' },
                ]
              : [],
        });
      }

      pages.push({
        id: uid(),
        title: `Page ${pi + 1}`,
        description: `Auto-generated test page ${pi + 1} with ${questionsPerPage} questions`,
        collapsed: false,
        items: items as any,
      });
    }

    return pages;
  }
}
