// Desktop tools the agent can call (executed by the adapter in the
// Electron main process / standalone server, as the local user).
// Enabled when SAGENT_ENABLE_FS_TOOLS=1 (the packaged app sets it).
import { readdirSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const DESKTOP_TOOLS: ToolDef[] = [
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
    name: 'reveal_path',
    description: 'Reveal a file or folder in the system file manager (Finder on macOS, Explorer on Windows).',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute path to reveal' } },
      required: ['path'],
    },
  },
];

const TEXT_EXTS = new Set([
  '.txt', '.md', '.json', '.jsonl', '.yaml', '.yml', '.toml', '.csv', '.tsv',
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.rs', '.go', '.java',
  '.c', '.h', '.cpp', '.html', '.css', '.scss', '.sh', '.env', '.xml', '.log',
]);

export function executeDesktopTool(name: string, args: Record<string, unknown>): unknown {
  const raw = typeof args?.path === 'string' ? args.path : '';
  const target = raw.trim();
  if (!target || !path.isAbsolute(target)) {
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
