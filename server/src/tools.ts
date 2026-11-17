// Desktop tools the agent can call (executed by the adapter in the
// Electron main process / standalone server, as the local user).
// Enabled when SAGENT_ENABLE_FS_TOOLS=1 (the packaged app sets it).
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const DESKTOP_TOOLS: ToolDef[] = [
  {
    name: 'list_skills',
    description: 'List installed skills (SKILL.md standard): name + description of each.',
    parameters: { type: 'object' },
  },
  {
    name: 'read_skill',
    description: 'Load a skill SKILL.md into context. Read it BEFORE following the skill.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Skill name from list_skills' } },
      required: ['name'],
    },
  },
  {
    name: 'save_skill',
    description: 'Create or update a skill (SKILL.md). Frontmatter is added automatically — provide body as markdown without the --- block. description max 60 chars.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'slug a-z 0-9 dash' },
        description: { type: 'string', description: 'One sentence, trigger-first, max 60 chars' },
        body: { type: 'string', description: 'Markdown body (no frontmatter)' },
        mode: { type: 'string', description: '"create" or "update"' },
      },
      required: ['name', 'description', 'body', 'mode'],
    },
  },
  {
    name: 'delete_skill',
    description: 'Delete a skill and its folder.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
  },
  {
    name: 'list_directory',
    description: 'List entries of a directory on the user machine. Returns name, is_dir, size bytes. Max 200 entries.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute directory path' } },
      required: ['path'],
    },
  },
  {
    name: 'read_text_file',
    description: 'Read a UTF-8 text file (max 64KB). Use for notes, code, configs — not binaries.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path' },
        max_bytes: { type: 'number', description: 'Optional cap, default 65536' },
      },
      required: ['path'],
    },
  },
  {
    name: 'edit_file',
    description: 'Edit a text file with an exact find→replace. The find string must match exactly once (error otherwise). More reliable than rewriting the whole file for small edits.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path' },
        find: { type: 'string', description: 'Exact text to find (must be unique in the file)' },
        replace: { type: 'string', description: 'Replacement text' },
      },
      required: ['path', 'find', 'replace'],
    },
  },
  {
    name: 'write_file',
    description: 'Create or overwrite a UTF-8 text file with the given content. Parent directories are created if missing. Text extensions only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path' },
        content: { type: 'string', description: 'Full file content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'create_file',
    description: 'Create a NEW UTF-8 text file. Fails if the file already exists (use write_file to overwrite).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path (must not exist)' },
        content: { type: 'string', description: 'File content' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web (DuckDuckGo, keyless). Returns titles, URLs and snippets. Use for current information.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        max_results: { type: 'number', description: 'Optional cap, default 5 (max 8)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'reveal_path',
    description: 'Reveal a file or folder in the system file manager (Finder on macOS, Explorer on Windows).',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute path to reveal' } },
      required: ['path'],
    },
  },
];

function decodeEntities(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

const TEXT_EXTS = new Set([
  '.txt', '.md', '.json', '.jsonl', '.yaml', '.yml', '.toml', '.csv', '.tsv',
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.rs', '.go', '.java',
  '.c', '.h', '.cpp', '.html', '.css', '.scss', '.sh', '.env', '.xml', '.log',
]);

export async function executeDesktopTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const raw = typeof args?.path === 'string' ? args.path : '';
  const target = raw.trim();
  // Only path-based tools require an absolute path (web_search has none).
  const needsPath = name !== 'web_search';
  if (needsPath && (!target || !path.isAbsolute(target))) {
    throw new Error('path must be absolute');
  }

  if (name === 'list_directory') {
    const entries = readdirSync(target, { withFileTypes: true }).slice(0, 200).map((e) => {
      let size: number | null = null;
      try { size = statSync(path.join(target, e.name)).size; } catch { /* gone */ }
      return { name: e.name, is_dir: e.isDirectory(), size };
    });
    return { path: target, count: entries.length, entries };
  }

  if (name === 'read_text_file') {
    const maxBytes = Math.min(Number(args?.max_bytes) || 65536, 65536);
    if (!TEXT_EXTS.has(path.extname(target).toLowerCase())) {
      throw new Error(`refusing to read non-text extension "${path.extname(target)}"`);
    }
    const stat = statSync(target);
    if (stat.size > 2_000_000) throw new Error('file too large (>2MB)');
    const content = readFileSync(target, 'utf8').slice(0, maxBytes);
    return { path: target, bytes: Math.min(stat.size, maxBytes), truncated: stat.size > maxBytes, content };
  }

  if (name === 'edit_file') {
    const find = typeof args?.find === 'string' ? args.find : null;
    const replace = typeof args?.replace === 'string' ? args.replace : null;
    if (find === null || replace === null || !find) throw new Error('find/replace must be non-empty strings');
    if (!TEXT_EXTS.has(path.extname(target).toLowerCase())) {
      throw new Error(`refusing to edit non-text extension "${path.extname(target)}"`);
    }
    const original = readFileSync(target, 'utf8');
    const count = original.split(find).length - 1;
    if (count === 0) throw new Error('ไม่พบข้อความที่ระบุในไฟล์ (find ต้องตรงเป๊ะ)');
    if (count > 1) throw new Error(`พบข้อความนี้ ${count} จุด — ระบุให้ยาวขึ้นเพื่อให้ตรงจุดเดียว`);
    writeFileSync(target, original.replace(find, replace), 'utf8');
    return { path: target, replaced: 1, bytes: Buffer.byteLength(original, 'utf8') };
  }

  if (name === 'write_file' || name === 'create_file') {
    const content = typeof args?.content === 'string' ? args.content : null;
    if (content === null || !path.isAbsolute(target)) throw new Error('path must be absolute and content a string');
    if (content.length > 1_000_000) throw new Error('content too large (>1MB)');
    if (!TEXT_EXTS.has(path.extname(target).toLowerCase())) {
      throw new Error(`refusing to write non-text extension "${path.extname(target)}"`);
    }
    if (name === 'create_file' && existsSync(target)) {
      throw new Error('file already exists — use write_file to overwrite');
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
    return { path: target, bytes: Buffer.byteLength(content, 'utf8'), created: name === 'create_file' || !existsSync(target) };
  }

  if (name === 'web_search') {
    const query = typeof args?.query === 'string' ? args.query.trim() : '';
    if (!query) throw new Error('query is required');
    const max = Math.min(Math.max(Number(args?.max_results) || 5, 1), 8);
    const res = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
      method: 'GET',
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36', 'accept-language': 'th,en;q=0.8' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`search HTTP ${res.status}`);
    const html = await res.text();
    // DDG html results: <a class="result__a" href="...">title</a> ... <a class="result__snippet"...>snippet</a>
    const results: Array<{ title: string; url: string; snippet: string }> = [];
    const linkRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRe = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
    const snippets: string[] = [];
    let sm: RegExpExecArray | null;
    while ((sm = snippetRe.exec(html)) !== null) snippets.push(decodeEntities(sm[1]));
    let lm: RegExpExecArray | null;
    while ((lm = linkRe.exec(html)) !== null && results.length < max) {
      let url = decodeEntities(lm[1]);
      // DDG wraps URLs: /l/?uddg=<encoded>
      const uddg = url.match(/[?&]uddg=([^&]+)/);
      if (uddg) url = decodeURIComponent(uddg[1]);
      if (!url.startsWith('http')) continue;
      results.push({ title: decodeEntities(lm[2]).slice(0, 200), url, snippet: (snippets[results.length] ?? '').slice(0, 300) });
    }
    if (results.length === 0) throw new Error('no results parsed (search layout may have changed)');
    return { query, count: results.length, results };
  }

  if (name === 'reveal_path') {
    statSync(target); // must exist
    if (process.platform === 'darwin') {
      spawn('open', ['-R', target], { stdio: 'ignore' });
    } else if (process.platform === 'win32') {
      spawn('explorer', [`/select,${target}`], { stdio: 'ignore' });
    } else {
      spawn('xdg-open', [path.dirname(target)], { stdio: 'ignore' });
    }
    return { revealed: target };
  }

  throw new Error(`unknown tool: ${name}`);
}
