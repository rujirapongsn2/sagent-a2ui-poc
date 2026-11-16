// Conversation history: JSON files under a conversations directory
// (Electron userData in the packaged app, .runtime/ in standalone dev).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  a2uiMessages?: unknown[];
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: HistoryMessage[];
}

function safeId(id: string): boolean {
  return /^[a-f0-9-]{8,64}$/i.test(id);
}

export class HistoryStore {
  private dir: string;

  constructor(dirPath: string) {
    this.dir = dirPath;
    mkdirSync(dirPath, { recursive: true });
  }

  private file(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }

  list(): Array<Pick<Conversation, 'id' | 'title' | 'updated_at'>> {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const c = JSON.parse(readFileSync(path.join(this.dir, f), 'utf8')) as Conversation;
          return { id: c.id, title: c.title, updated_at: c.updated_at };
        } catch {
          return null;
        }
      })
      .filter((v): v is Pick<Conversation, 'id' | 'title' | 'updated_at'> => Boolean(v))
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  }

  get(id: string): Conversation | null {
    if (!safeId(id) || !existsSync(this.file(id))) return null;
    try {
      return JSON.parse(readFileSync(this.file(id), 'utf8')) as Conversation;
    } catch {
      return null;
    }
  }

  /** Upsert. Without an id a new conversation is created. */
  save(input: { id?: string; title?: string; messages: HistoryMessage[] }): Conversation {
    const now = new Date().toISOString();
    let conv: Conversation;
    if (input.id && safeId(input.id)) {
      const existing = this.get(input.id);
      if (!existing) throw new Error('conversation not found');
      conv = {
        ...existing,
        title: input.title?.trim() || existing.title,
        messages: input.messages,
        updated_at: now,
      };
    } else {
      conv = {
        id: randomUUID(),
        title: input.title?.trim().slice(0, 60) || 'บทสนทนาใหม่',
        created_at: now,
        updated_at: now,
        messages: input.messages,
      };
    }
    writeFileSync(this.file(conv.id), JSON.stringify(conv, null, 2));
    return conv;
  }

  delete(id: string): boolean {
    if (!safeId(id) || !existsSync(this.file(id))) return false;
    rmSync(this.file(id));
    return true;
  }
}
