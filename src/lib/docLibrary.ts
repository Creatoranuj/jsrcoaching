// Minimal client-side "Saved documents" library.
// Persists via safeGet/safeSet so users can re-open PDFs/DPPs/Notes from the
// Library page without re-navigating the course tree. Keep the schema
// stable — bump the key suffix if you change shape.
import { safeGetJSON, safeSetJSON } from "./storage";

const KEY = "nb:doc-library:v1";

export interface SavedDoc {
  id: string;            // lessonId || url
  title: string;
  subtitle?: string;
  badge?: string;
  url: string;
  savedAt: number;
}

function read(): SavedDoc[] {
  const arr = safeGetJSON<SavedDoc[]>(KEY, []);
  return Array.isArray(arr) ? arr : [];
}

function write(list: SavedDoc[]) {
  if (safeSetJSON(KEY, list)) {
    try { window.dispatchEvent(new CustomEvent("nb:doc-library-changed")); } catch { /* SSR */ }
  }
  // Quota or private mode — best effort, swallow (safeSetJSON already returned false).
}

export function listSavedDocs(): SavedDoc[] {
  return read();
}

export function isDocSaved(id: string): boolean {
  return read().some((d) => d.id === id);
}

export function saveDoc(doc: Omit<SavedDoc, "savedAt">): void {
  const list = read().filter((d) => d.id !== doc.id);
  list.unshift({ ...doc, savedAt: Date.now() });
  write(list.slice(0, 200)); // hard cap to avoid runaway storage growth
}

export function removeDoc(id: string): void {
  write(read().filter((d) => d.id !== id));
}

export function toggleDoc(doc: Omit<SavedDoc, "savedAt">): boolean {
  if (isDocSaved(doc.id)) {
    removeDoc(doc.id);
    return false;
  }
  saveDoc(doc);
  return true;
}
