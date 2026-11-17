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
  /** for PDFs with a text layer: the extracted .txt the agent can read */
  textPath?: string;
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

/** Extract a PDF's text layer with pdf-parse (pure JS — works on macOS and
 *  Windows alike). Dynamic import keeps it out of module-load time; the
 *  subpath import skips the package's test-file debug branch. Returns null
 *  for scanned/image-only PDFs (no text layer). */
async function extractPdfText(pdfPath: string): Promise<string | null> {
  try {
    const mod: any = await import('pdf-parse/lib/pdf-parse.js');
    const pdf = mod.default ?? mod;
    const data = await pdf(pdfPath);
    const text = String(data?.text ?? '').trim();
    return text.length >= 20 ? text : null;
  } catch {
    return null;
  }
}

/** After storing a file, give PDFs a text-layer companion (.txt) so the agent
 *  can read them like any text file. Returns patch fields for the attachment. */
async function pdfCompanion(dest: string): Promise<Partial<Attachment> | null> {
  if (path.extname(dest).toLowerCase() !== '.pdf') return null;
  const text = await extractPdfText(dest);
  if (!text) return null;
  const txtPath = dest.replace(/\.pdf$/i, '.extracted.txt');
  writeFileSync(txtPath, text, 'utf8');
  return { kind: 'text', textPath: txtPath };
}

export class UploadStore {
  private root: string;

  constructor(rootPath: string) {
    this.root = rootPath;
    mkdirSync(rootPath, { recursive: true });
  }

  /** From a local absolute path (Electron picker / Photos library copy). */
  async fromPath(sourcePath: string): Promise<Attachment> {
    const name = safeName(path.basename(sourcePath));
    const id = randomUUID().slice(0, 8);
    const dest = path.join(this.root, `${id}__${name}`);
    copyFileSync(sourcePath, dest);
    return { id, name, path: dest, kind: kindOf(name), size: statSync(dest).size,
      ...(await pdfCompanion(dest)) };
  }

  /** From bytes (web fallback). */
  async fromBytes(name: string, base64: string): Promise<Attachment> {
    const safe = safeName(name);
    const id = randomUUID().slice(0, 8);
    const dest = path.join(this.root, `${id}__${safe}`);
    writeFileSync(dest, Buffer.from(base64, 'base64'));
    return { id, name: safe, path: dest, kind: kindOf(safe), size: statSync(dest).size,
      ...(await pdfCompanion(dest)) };
  }

  /** Small text files are inlined into the prompt so the model can read them
   *  without a tool round-trip. PDFs read via their extracted text companion. */
  inlineIfText(att: Attachment, maxBytes = 16_000): string | null {
    if (att.kind !== 'text') return null;
    const source = att.textPath ?? att.path;
    try {
      const stat = statSync(source);
      if (stat.size > maxBytes) return null;
      return readFileSync(source, 'utf8');
    } catch { return null; }
  }
}
