// File uploads the agent can process. Files land in <uploadsRoot>/<id>__<name>.
// Sources: Electron native file picker (paths, incl. macOS Photos picks) or
// web dev fallback (base64 bytes).
import { mkdirSync, copyFileSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface Attachment {
  id: string;
  name: string;
  /** absolute stored path */
  path: string;
  kind: 'text' | 'image' | 'binary';
  size: number;
}

const TEXT_EXTS = new Set([
  '.txt', '.md', '.json', '.jsonl', '.yaml', '.yml', '.toml', '.csv', '.tsv',
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.rs', '.go', '.java',
  '.c', '.h', '.cpp', '.html', '.css', '.scss', '.sh', '.env', '.xml', '.log',
]);
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic', '.tiff']);

function kindOf(name: string): Attachment['kind'] {
  const ext = path.extname(name).toLowerCase();
  if (TEXT_EXTS.has(ext)) return 'text';
  if (IMAGE_EXTS.has(ext)) return 'image';
  return 'binary';
}

function safeName(name: string): string {
  return name.replace(/[\\/]/g, '_').slice(0, 120) || 'file';
}

export class UploadStore {
  private root: string;

  constructor(rootPath: string) {
    this.root = rootPath;
    mkdirSync(rootPath, { recursive: true });
  }

  /** From a local absolute path (Electron picker / Photos library copy). */
  fromPath(sourcePath: string): Attachment {
    const name = safeName(path.basename(sourcePath));
    const id = randomUUID().slice(0, 8);
    const dest = path.join(this.root, `${id}__${name}`);
    copyFileSync(sourcePath, dest);
    return { id, name, path: dest, kind: kindOf(name), size: statSync(dest).size };
  }

  /** From bytes (web fallback). */
  fromBytes(name: string, base64: string): Attachment {
    const safe = safeName(name);
    const id = randomUUID().slice(0, 8);
    const dest = path.join(this.root, `${id}__${safe}`);
    writeFileSync(dest, Buffer.from(base64, 'base64'));
    return { id, name: safe, path: dest, kind: kindOf(safe), size: statSync(dest).size };
  }

  /** Small text files are inlined into the prompt so the model can read them
   *  without a tool round-trip. */
  inlineIfText(att: Attachment, maxBytes = 16_000): string | null {
    if (att.kind !== 'text' || att.size > maxBytes) return null;
    try { return readFileSync(att.path, 'utf8'); } catch { return null; }
  }
}
