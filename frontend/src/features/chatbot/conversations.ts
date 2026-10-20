/**
 * Chat conversations kept in this browser only. The chatbot API is stateless:
 * every question is answered on its own, so history here is a convenience for
 * the signed-in user, never sent back to the server.
 */

export interface ChatSource {
  chunk_id: string;
  title: string;
  material_title: string;
  source_name: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  sources?: ChatSource[];
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export const MAX_CONVERSATIONS = 30;
export const MAX_MESSAGES = 80;
export const MESSAGE_MAX_CHARS = 2000;
const TITLE_MAX = 60;
const STORAGE_PREFIX = 'edulit.chatbot.v1:';

export function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function titleFrom(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return 'Cuộc trò chuyện mới';
  return clean.length > TITLE_MAX ? `${clean.slice(0, TITLE_MAX - 1).trimEnd()}…` : clean;
}

export function createConversation(now: Date = new Date()): Conversation {
  const iso = now.toISOString();
  return { id: newId('c'), title: 'Cuộc trò chuyện mới', createdAt: iso, updatedAt: iso, messages: [] };
}

/** Append a message; the first question names the conversation. */
export function appendMessage(conversation: Conversation, message: ChatMessage): Conversation {
  const messages = [...conversation.messages, message].slice(-MAX_MESSAGES);
  const firstQuestion = conversation.messages.length === 0 && message.role === 'user';
  return {
    ...conversation,
    title: firstQuestion ? titleFrom(message.text) : conversation.title,
    updatedAt: message.createdAt,
    messages,
  };
}

/** Insert or replace, newest first, capped; empty conversations are not kept. */
export function upsertConversation(list: Conversation[], conversation: Conversation): Conversation[] {
  const rest = list.filter((item) => item.id !== conversation.id);
  if (conversation.messages.length === 0) return rest;
  return [conversation, ...rest]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_CONVERSATIONS);
}

export function lastQuestion(conversation: Conversation | null): string {
  if (!conversation) return '';
  for (let i = conversation.messages.length - 1; i >= 0; i -= 1) {
    if (conversation.messages[i].role === 'user') return conversation.messages[i].text;
  }
  return '';
}

export interface ConversationGroup {
  label: string;
  items: Conversation[];
}

function dayStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function groupByDay(list: Conversation[], now: Date = new Date()): ConversationGroup[] {
  const today = dayStart(now);
  const day = 24 * 60 * 60 * 1000;
  const buckets: [string, Conversation[]][] = [
    ['Hôm nay', []],
    ['Hôm qua', []],
    ['7 ngày qua', []],
    ['Trước đó', []],
  ];
  for (const item of list) {
    const start = dayStart(new Date(item.updatedAt));
    const index = start >= today ? 0 : start >= today - day ? 1 : start >= today - 7 * day ? 2 : 3;
    buckets[index][1].push(item);
  }
  return buckets.filter(([, items]) => items.length > 0).map(([label, items]) => ({ label, items }));
}

function isMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    (item.role === 'user' || item.role === 'assistant') &&
    typeof item.text === 'string' &&
    typeof item.createdAt === 'string'
  );
}

/** Parse stored data defensively; anything malformed is dropped. */
export function parseStored(raw: string | null): Conversation[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data
      .filter((item): item is Conversation => {
        if (!item || typeof item !== 'object') return false;
        const conv = item as Record<string, unknown>;
        return (
          typeof conv.id === 'string' &&
          typeof conv.title === 'string' &&
          typeof conv.updatedAt === 'string' &&
          Array.isArray(conv.messages)
        );
      })
      .map((conv) => ({ ...conv, messages: conv.messages.filter(isMessage).slice(-MAX_MESSAGES) }))
      .filter((conv) => conv.messages.length > 0)
      .slice(0, MAX_CONVERSATIONS);
  } catch {
    return [];
  }
}

export function loadConversations(userId: string): Conversation[] {
  try {
    return parseStored(window.localStorage.getItem(storageKey(userId)));
  } catch {
    return [];
  }
}

export function saveConversations(userId: string, list: Conversation[]): void {
  try {
    if (list.length === 0) {
      window.localStorage.removeItem(storageKey(userId));
    } else {
      window.localStorage.setItem(storageKey(userId), JSON.stringify(list));
    }
  } catch {
    /* storage unavailable: the chat still works for this visit */
  }
}

/** Unique sources, in order, so one material is listed once. */
export function uniqueSources(sources: ChatSource[] | undefined): ChatSource[] {
  const seen = new Set<string>();
  const out: ChatSource[] = [];
  for (const source of sources || []) {
    const key = `${source.source_name}|${source.material_title}|${source.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(source);
  }
  return out;
}
