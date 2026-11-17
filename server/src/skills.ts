// Skill store — SKILL.md standard (Hermes-compatible conventions).
// Each skill = <skillsRoot>/<name>/SKILL.md with YAML frontmatter
// (name, description, optional version/author/license) + markdown body.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface SkillMeta {
  name: string;
  description: string;
  version?: string;
}

export interface Skill extends SkillMeta {
  markdown: string; // full SKILL.md (frontmatter + body)
}

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function parseFrontmatter(raw: string): { meta: SkillMeta; body: string } {
  const meta: SkillMeta = { name: '', description: '' };
  let body = raw;
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (m) {
    body = m[2];
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
      if (!kv) continue;
      const key = kv[1].toLowerCase();
      const value = kv[2].trim().replace(/^["']|["']$/g, '');
      if (key === 'name') meta.name = value;
      else if (key === 'description') meta.description = value;
      else if (key === 'version') meta.version = value;
    }
  }
  return { meta, body };
}

function serialize(name: string, description: string, version: string | undefined, body: string): string {
  const fm = [
    '---',
    `name: ${name}`,
    `description: "${description.replace(/"/g, '\\"')}"`,
    ...(version ? [`version: ${version}`] : []),
    '---',
    '',
  ].join('\n');
  return fm + body.replace(/^\s+/, '') + '\n';
}

export class SkillStore {
  private root: string;

  constructor(rootPath: string) {
    this.root = rootPath;
    mkdirSync(rootPath, { recursive: true });
  }

  private dir(name: string): string {
    return path.join(this.root, name);
  }

  list(): SkillMeta[] {
    if (!existsSync(this.root)) return [];
    return readdirSync(this.root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => {
        const file = path.join(this.root, e.name, 'SKILL.md');
        if (!existsSync(file)) return null;
        try {
          const { meta } = parseFrontmatter(readFileSync(file, 'utf8'));
          return { name: meta.name || e.name, description: meta.description, version: meta.version };
        } catch {
          return null;
        }
      })
      .filter((v): v is SkillMeta => Boolean(v))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  get(name: string): Skill | null {
    if (!NAME_RE.test(name)) return null;
    const file = path.join(this.dir(name), 'SKILL.md');
    if (!existsSync(file)) return null;
    const raw = readFileSync(file, 'utf8');
    const { meta, body } = parseFrontmatter(raw);
    return { name: meta.name || name, description: meta.description, version: meta.version, markdown: raw };
  }

  /** Create or update. Returns the saved skill; throws on invalid input. */
  save(input: {
    name: string;
    description: string;
    body: string;
    version?: string;
    mode: 'create' | 'update';
  }): Skill {
    const name = input.name.trim().toLowerCase();
    if (!NAME_RE.test(name)) {
      throw new Error('ชื่อ skill ต้องเป็น a-z, 0-9, ขีดกลาง (≤64 ตัว, เริ่มด้วยตัวอักษร/ตัวเลข)');
    }
    const description = input.description.trim();
    if (!description) throw new Error('ต้องมี description');
    // Hermes keeps the skill index readable with a 60-char description cap —
    // same rule here, enforced as a hard limit for parity.
    if (description.length > 60) {
      throw new Error(`description ต้องไม่เกิน 60 ตัวอักษร (ตอนนี้ ${description.length})`);
    }
    const body = input.body?.trim() ?? '';
    if (!body) throw new Error('ต้องมีเนื้อหา (markdown body)');

    const exists = existsSync(path.join(this.dir(name), 'SKILL.md'));
    if (input.mode === 'create' && exists) throw new Error(`มี skill "${name}" อยู่แล้ว`);
    if (input.mode === 'update' && !exists) throw new Error(`ไม่พบ skill "${name}"`);

    mkdirSync(this.dir(name), { recursive: true });
    writeFileSync(path.join(this.dir(name), 'SKILL.md'), serialize(name, description, input.version, body), 'utf8');
    return this.get(name)!;
  }

  delete(name: string): boolean {
    if (!NAME_RE.test(name) || !existsSync(this.dir(name))) return false;
    rmSync(this.dir(name), { recursive: true, force: true });
    return true;
  }
}
