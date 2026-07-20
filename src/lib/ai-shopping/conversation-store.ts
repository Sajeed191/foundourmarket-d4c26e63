// Conversation storage abstraction for the AI Shopping Assistant.
//
// The Assistant UI and business logic MUST depend on the `ConversationStore`
// interface only — never on `localStorage`, Supabase, or any concrete backend.
//
// Current implementation: `LocalStorageConversationStore` (browser-only,
// on-device history). Future: `DatabaseConversationStore` (Lovable Cloud,
// synced across devices). Swapping the store must require ZERO changes to
// the AI logic or UI.
import type { AiMessage, AiThread, AiThreadIndexEntry } from "./types";
import * as ls from "./storage";

export interface ConversationStore {
  /** List threads, newest first. Safe to call on server (returns []). */
  getThreads(): AiThreadIndexEntry[];
  /** Load a full thread by id, or null if missing. */
  loadThread(id: string): AiThread | null;
  /** Persist a thread (create-or-update). Bumps `updatedAt`. */
  saveThread(thread: AiThread): void;
  /** Delete a single thread. */
  deleteThread(id: string): void;
  /** Clear one thread's messages but keep the thread record. */
  clearThread(id: string): void;
  /** Delete every thread. */
  clearAll(): void;
  /** Factory: build an empty thread record. */
  createEmptyThread(): AiThread;
  /** Factory: build a message with a stable id and timestamp. */
  makeMessage(role: AiMessage["role"], content: string, products?: AiMessage["products"]): AiMessage;
  /** Derive a thread title from its first user message. */
  titleFromFirstMessage(text: string): string;
}

// --- LocalStorage backend (v1.1) ---------------------------------------
// Thin adapter over the existing browser-only storage helpers. This is the
// only place the app reaches into `localStorage` for AI history.
export const LocalStorageConversationStore: ConversationStore = {
  getThreads: () => ls.listThreads(),
  loadThread: (id) => ls.loadThread(id),
  saveThread: (t) => ls.saveThread(t),
  deleteThread: (id) => ls.deleteThread(id),
  clearThread(id) {
    const t = ls.loadThread(id);
    if (!t) return;
    ls.saveThread({ ...t, messages: [] });
  },
  clearAll() {
    for (const entry of ls.listThreads()) ls.deleteThread(entry.id);
  },
  createEmptyThread: () => ls.createEmptyThread(),
  makeMessage: (role, content, products) => ls.makeMessage(role, content, products),
  titleFromFirstMessage: (text) => ls.titleFromFirstMessage(text),
};

// Default export used by the Assistant. To migrate storage, change ONLY
// this line — no other files should need edits.
export const conversationStore: ConversationStore = LocalStorageConversationStore;
