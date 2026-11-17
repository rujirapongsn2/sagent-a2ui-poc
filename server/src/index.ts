// sagent-a2ui PoC adapter: HTTP+SSE front for the sagent-engine JSONL protocol.
// Wire: browser --SSE--> this adapter --stdin JSONL--> sagent-engine (subprocess)
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { SettingsStore, type SecureStore } from './settings.js';
import { HistoryStore, type HistoryMessage } from './history.js';
import { SkillStore } from './skills.js';
import { DESKTOP_TOOLS, executeDesktopTool } from './tools.js';

// Resolve this file's directory in BOTH module worlds: ESM (tsx/dev) and the
// CJS esbuild bundle used by Electron (where import.meta.url is undefined).
const HERE = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
// Mutable so an embedding host (Electron main) can set its packaged paths at
// startup instead of racing import-time env evaluation.
let ENGINE = process.env.SAGENT_ENGINE ?? path.join(ROOT, 'engine', 'sagent-engine');
let APP_DIST = process.env.APP_DIST ?? path.join(ROOT, 'app', 'dist');
const PORT = Number(process.env.PORT ?? 8790);
const HOST = process.env.HOST ?? '127.0.0.1';

// Provider config resolves in priority order per run:
//   saved Settings (Settings UI) → env (SAGENT_PROVIDER / GLM_*) → mock.
const ENV_PROVIDER = process.env.SAGENT_PROVIDER ?? 'mock';
// Read LAZILY per request: the Electron host sets this env AFTER this module
// evaluates (import hoisting) — caching at load time silently drops every
// desktop tool in the packaged app.
let fsToolsForced = false;
function fsToolsEnabled(): boolean {
  return fsToolsForced || process.env.SAGENT_ENABLE_FS_TOOLS === '1';
}

let settingsStore: SettingsStore | null = null;
let historyStore: HistoryStore | null = null;
let skillStore: SkillStore | null = null;

/** Build the sagent LlmConfig for this run from settings/env defaults. */
function llmConfigForRun() {
  const fromEnv = {
    provider: ENV_PROVIDER,
    base_url: ENV_PROVIDER === 'openai_compat' ? (process.env.GLM_BASE_URL ?? 'https://api.z.ai/api/coding/paas/v4') : null,
    model: ENV_PROVIDER === 'openai_compat' ? (process.env.SAGENT_MODEL ?? 'glm-5.3-flash') : null,
    api_key: ENV_PROVIDER === 'openai_compat' ? (process.env.GLM_API_KEY ?? null) : null,
  };
  if (settingsStore) {
    const cfg = settingsStore.llmConfig();
    if (cfg.provider === 'openai_compat' || cfg.provider === 'ollama') {
      const baseUrl = cfg.provider === 'openai_compat'
        ? (cfg.base_url || fromEnv.base_url)
        : (cfg.base_url || 'http://127.0.0.1:11434');
      return {
        provider: cfg.provider,
        base_url: baseUrl,
        model: cfg.model || fromEnv.model || (cfg.provider === 'ollama' ? 'qwen3:8b' : 'glm-5.3-flash'),
        api_key: cfg.api_key,
      };
    }
    return { provider: cfg.provider as 'mock', base_url: null, model: null, api_key: null };
  }
  return fromEnv;
}

function toolDefinitions() {
  const defs = [{ name: 'demo', description: 'Demo tool proving the tool round-trip', parameters: { type: 'object' } }];
  if (fsToolsEnabled()) defs.push(...DESKTOP_TOOLS);
  return defs;
}

async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === 'demo') return { ok: true, by: 'adapter' };
  // Skills are always available (they are the agent's own capability layer).
  if (name === 'list_skills') {
    return { skills: skillStore?.list() ?? [] };
  }
  if (name === 'read_skill') {
    const skill = skillStore?.get(String(args?.name ?? ''));
    if (!skill) throw new Error(`ไม่พบ skill "${args?.name}"`);
    if (skill.markdown.length > 32_000) throw new Error('skill ใหญ่เกิน 32KB');
    return { name: skill.name, markdown: skill.markdown };
  }
  if (name === 'save_skill') {
    if (!skillStore) throw new Error('skill store unavailable');
    const mode = args?.mode === 'update' ? 'update' : 'create';
    return skillStore.save({
      name: String(args?.name ?? ''),
      description: String(args?.description ?? ''),
      body: String(args?.body ?? ''),
      mode,
    });
  }
  if (name === 'delete_skill') {
    const ok = skillStore?.delete(String(args?.name ?? '')) ?? false;
    if (!ok) throw new Error(`ลบไม่สำเร็จ: ไม่พบ skill "${args?.name}"`);
    return { deleted: String(args?.name) };
  }
  if (fsToolsEnabled() && DESKTOP_TOOLS.some((t) => t.name === name)) {
    return await executeDesktopTool(name, args);
  }
  throw new Error(`unknown tool: ${name}`);
}

// v1.0 basic catalog id (must be the exact URI the client catalog declares).
const BASIC_CATALOG_ID = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json';

// A2UI v1.0 contract taught to the agent: a fenced ```a2ui block carrying an
// array of v1.0 envelope messages, rendered by @a2ui/web_core on the client.
const SYSTEM_PROMPT = `คุณคือ assistant ภาษาไทยของแอป desktop

## A2UI — คุณตัดสินใจเองว่าเมื่อไหร่ควร "วาด UI" ให้ผู้ใช้ (ผู้ใช้ไม่ต้องขอ)
ใช้เมื่อคำตอบมีลักษณะนี้โดยธรรมชาติ: มี action ให้กดยืนยัน/เลือก · มีตัวเลือกหลายรายการให้เปรียบเทียบ · ต้องเก็บข้อมูลจากผู้ใช้ (ฟอร์ม) · สรุปข้อมูลที่มีโครงสร้างชัด (รายการ/ตาราง)
ไม่ใช้เมื่อ: คำตอบสั้น ๆ อธิบาย สนทนาทั่วไป — ตอบข้อความธรรมดา
วิธีส่ง: ตอบข้อความนำสั้น ๆ 1-2 ประโยค แล้วตามด้วยบล็อก \`\`\`a2ui ท้ายสุด — **ห้ามแสดงหรืออธิบาย JSON นอกบล็อก** (ระบบซ่อนโค้ดให้ผู้ใช้อยู่แล้ว)

รูปแบบ (เปลี่ยนแต่ข้อมูล/ข้อความ ห้ามเปลี่ยนโครงสร้าง):

\`\`\`a2ui
[
  {"version":"1.0","createSurface":{"surfaceId":"card-1","catalogId":"${BASIC_CATALOG_ID}"}},
  {"version":"1.0","updateComponents":{"surfaceId":"card-1","components":[
    {"id":"root","component":"Column","children":["title","detail","book","book_label"]},
    {"id":"title","component":"Text","text":{"@path":"/title"},"variant":"body"},
    {"id":"detail","component":"Text","text":{"@path":"/detail"},"variant":"body"},
    {"id":"book","component":"Button","child":"book_label","variant":"primary","action":{"event":{"name":"confirm_pressed","context":{}}}},
    {"id":"book_label","component":"Text","text":{"@path":"/btn"}}
  ]}},
  {"version":"1.0","updateDataModel":{"surfaceId":"card-1","path":"/","value":{
    "title":"จองโต๊ะ","detail":"ร้านอิตาลี 4 ที่นั่ง","btn":"ยืนยันการจอง"
  }}}
]
\`\`\`
(สังเกต: child ของ Button ต้องเป็น id ของ Text component ที่ประกาศแยก และ action ใช้ event:{name,context})

ตัวอย่างที่ 2 — การ์ดอนุมัติงาน (หลายปุ่มหลาย action):
\`\`\`a2ui
[
  {"version":"1.0","createSurface":{"surfaceId":"card-1","catalogId":"${BASIC_CATALOG_ID}"}},
  {"version":"1.0","updateComponents":{"surfaceId":"card-1","components":[
    {"id":"root","component":"Column","children":["title","detail","approve","ap_label","reject","re_label"]},
    {"id":"title","component":"Text","text":{"@path":"/title"},"variant":"body"},
    {"id":"detail","component":"Text","text":{"@path":"/detail"},"variant":"body"},
    {"id":"approve","component":"Button","child":"ap_label","variant":"primary","action":{"event":{"name":"approve","context":{}}}},
    {"id":"ap_label","component":"Text","text":"อนุมัติ"},
    {"id":"reject","component":"Button","child":"re_label","action":{"event":{"name":"reject","context":{}}}},
    {"id":"re_label","component":"Text","text":"ปฏิเสธ"}
  ]}},
  {"version":"1.0","updateDataModel":{"surfaceId":"card-1","path":"/","value":{
    "title":"อนุมัติใบลา","detail":"คุณสมชาย ลากิจ 3 วัน"
  }}}
]
\`\`
ส่วนประกอบที่ใช้ได้: Column, Row, Text (variant: body|caption), Button (variant: primary หรือไม่ใส่), Card, List, TextField, Divider, Image, Icon

ตอบสั้นกระชับ เป็นมิตร ถ้าข้อมูลไม่พอให้ถามกลับ 1 คำถาม
เมื่อมี tools ให้ใช้ tool ช่วยตอบ (เช่น list_directory, read_text_file) แล้วสรุปผล

## กฎการทำงานกับไฟล์ (สำคัญ — ความน่าเชื่อถือของคุณ)
- ทุกการสร้าง/แก้ไข/ลบไฟล์ **ต้องเรียก tool จริงทุกครั้ง** — ห้ามตอบว่า "ทำเรียบร้อย" ถ้ายังไม่ได้เรียก tool และเห็นผลลัพธ์สำเร็จ
- แก้ไขไฟล์: ถ้าเป็นการเปลี่ยนบางส่วน → เรียก read_text_file ดูก่อน แล้วใช้ edit_file (find/replace เป๊ะ) — ถ้าเปลี่ยนทั้งไฟล์จึงใช้ write_file
- ถ้าไม่แน่ใจ path ของไฟล์ที่พูดถึงในบทสนทนา ให้ไล่ดูจากข้อความก่อนหน้า หาไม่เจอค่อยถามผู้ใช้ — **ห้ามเดา path**
- tool ตอบ error กลับมา = งานยังไม่สำเร็จ ให้แก้แล้วลองใหม่ หรือแจ้งผู้ใช้ตามจริง

## Skills (SKILL.md)
คุณมีระบบ skills (มาตรฐาน SKILL.md แบบ Hermes) — จัดการผ่าน tools เท่านั้น:
- ใช้ skill: list_skills → read_skill(name) → ทำตามคำแนะนำใน SKILL.md ก่อนตอบ
- สร้าง/แก้: save_skill (ส่ง body เป็น markdown ไม่รวม --- frontmatter, description ≤60 ตัวอักษร, mode create/update)
- ลบ: delete_skill
- **ห้ามสร้าง/เขียนไฟล์ SKILL.md เองด้วย write_file/create_file เด็ดขาด และห้ามแตะ ~/.hermes หรือโฟลเดอร์ skills ด้วยมือ — ใช้ save_skill/delete_skill เท่านั้น**
- skill ที่ดี: คำสั่งเป็นขั้นตอน ระบุเงื่อนไขการใช้ บอกข้อควรระวัง ไม่ใช่บันทึกย่อ`;

// Mock-mode demo card: proves the renderer + action round-trip without an LLM.
// Shape follows the official catalogs/basic/v1/examples/scaffold-interactive-
// button.json: Button.child references a Text component id; action uses
// action.event {name, context}.
const MOCK_CARD = [
  { version: '1.0', createSurface: { surfaceId: 'demo-card', catalogId: BASIC_CATALOG_ID } },
  {
    version: '1.0',
    updateComponents: {
      surfaceId: 'demo-card',
      components: [
        { id: 'root', component: 'Column', children: ['title', 'detail', 'book'] },
        { id: 'title', component: 'Text', text: { '@path': '/title' }, variant: 'body' },
        { id: 'detail', component: 'Text', text: { '@path': '/detail' }, variant: 'body' },
        { id: 'book', component: 'Button', child: 'book_label', variant: 'primary', action: { event: { name: 'book_pressed', context: {} } } },
        { id: 'book_label', component: 'Text', text: { '@path': '/btn' } },
      ],
    },
  },
  {
    version: '1.0',
    updateDataModel: {
      surfaceId: 'demo-card',
      path: '/',
      value: { title: 'A2UI v1.0 การ์ดทดสอบ', detail: 'กดปุ่มเพื่อทดสอบ action กลับไปที่ agent', btn: 'ส่ง action กลับ' },
    },
  },
];

interface ChatBody {
  message?: string;
  history?: { role: string; content: string }[];
}

function readBody(req: IncomingMessage): Promise<ChatBody> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 200_000) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

/** Keep tool_result SSE payloads bounded (frontend truncates display anyway). */
function capForSse(value: unknown): unknown {
  try {
    const json = JSON.stringify(value);
    if (json.length <= 4000) return value;
    return { _truncated: true, preview: json.slice(0, 2000) + '…' };
  } catch {
    return { _unserializable: true };
  }
}

function sseSend(res: ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// Extract a fenced ```a2ui JSON array from the agent's final text.
function extractA2ui(text: string): { messages: unknown[] } | null {
  const m = text.match(/```a2ui\s*([\s\S]*?)```/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]);
    if (Array.isArray(parsed) && parsed.length > 0) return { messages: parsed };
  } catch { /* fallthrough */ }
  return null;
}

async function runEngine(body: ChatBody, res: ServerResponse) {
  const prompt = (body.message ?? '').trim();
  if (!prompt) { res.writeHead(400); res.end(JSON.stringify({ error: 'message required' })); return; }
  const rawHistory = Array.isArray(body.history) ? body.history.filter((m) => m && typeof m.content === 'string') : [];
  // sagent requires strictly alternating user/assistant pairs starting with
  // 'user' — drop any leading/stray assistant messages (e.g. the welcome note).
  const history: { role: string; content: string }[] = [];
  for (const m of rawHistory) {
    const expected = history.length % 2 === 0 ? 'user' : 'assistant';
    if (m.role === expected) history.push({ role: m.role, content: m.content });
  }

  const config = llmConfigForRun();
  const runtimeContext = `\n\n## บริบทเครื่องผู้ใช้\n- home: ${os.homedir()}\n- platform: ${process.platform} (${process.arch})\n- เมื่อผู้ใช้ถามถึง "folder ปัจจุบัน" ให้เข้าใจว่าคือการทำงานกับระบบไฟล์ของผู้ใช้ — เริ่มจาก home ข้างบน`;
  const payload = {
    protocol: 1,
    prompt,
    system_prompt: (config.provider === 'openai_compat' ? SYSTEM_PROMPT : '') + runtimeContext,
    messages: history,
    config: { ...config, max_turns: 12 },
    tools: toolDefinitions(),
  };

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  sseSend(res, 'start', { provider: config.provider });

  const child = spawn(ENGINE, [], { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.write(JSON.stringify(payload) + '\n');

  const rl = readline.createInterface({ input: child.stdout });
  const stderr: string[] = [];
  child.stderr.on('data', (c) => stderr.push(String(c)));

  let finalText = '';

  rl.on('line', async (line) => {
    let frame: any;
    try { frame = JSON.parse(line); } catch { return; }
    if (frame.kind === 'event' && frame.event?.type === 'messageUpdate') {
      // sagent streams deltas; forward as-is for the client to assemble.
      sseSend(res, 'delta', frame.event);
    } else if (frame.kind === 'tool_request') {
      // Tool activity is SYSTEM truth (not model prose): both events are
      // emitted by the adapter so the transcript stays verifiable.
      const started = Date.now();
      sseSend(res, 'tool', { id: frame.id, name: frame.name, arguments: frame.arguments ?? {} });
      let reply: Record<string, unknown>;
      let outcome: Record<string, unknown>;
      try {
        const result = await executeTool(frame.name, frame.arguments ?? {});
        reply = { protocol: 1, kind: 'tool_result', id: frame.id, result };
        outcome = { id: frame.id, name: frame.name, ok: true, latency_ms: Date.now() - started, result: capForSse(result) };
      } catch (e: any) {
        const msg = String(e?.message ?? e).slice(0, 400);
        reply = { protocol: 1, kind: 'tool_result', id: frame.id, error: msg };
        outcome = { id: frame.id, name: frame.name, ok: false, latency_ms: Date.now() - started, error: msg };
      }
      sseSend(res, 'tool_result', outcome);
      child.stdin.write(JSON.stringify(reply) + '\n');
    } else if (frame.kind === 'done') {
      finalText = frame.text ?? '';
      sseSend(res, 'done', { ok: frame.ok, stop_reason: frame.stop_reason, error: frame.error ?? null });
    } else if (frame.kind === 'error') {
      sseSend(res, 'done', { ok: false, stop_reason: 'error', error: frame.message });
    }
  });

  child.on('close', (code) => {
    if (config.provider === 'mock') {
      // Mock provider returns fixed text; inject the demo card so the
      // A2UI v1.0 render + action path is proven without spending tokens.
      sseSend(res, 'delta', { type: 'messageUpdate', delta: { text: 'mock completed — แนบการ์ดทดสอบ A2UI v1.0' } });
      sseSend(res, 'a2ui', { messages: MOCK_CARD });
      sseSend(res, 'done', { ok: true, stop_reason: 'stop', error: null });
    } else {
      const a2ui = extractA2ui(finalText);
      if (a2ui) sseSend(res, 'a2ui', a2ui);
    }
    if (stderr.length) console.error('[engine stderr]', stderr.join('').slice(0, 500));
    sseSend(res, 'end', { code });
    res.end();
  });

  reqCleanup(res, child);
}

function reqCleanup(_res: ServerResponse, _child: ReturnType<typeof spawn>) {
  // PoC: no cancel endpoint yet; engine runs are short-lived.
}


// ---- Test connection: run a minimal real inference through the engine ----
async function testLlmConnection(override?: {
  provider?: string; base_url?: string; model?: string; api_key?: string;
}): Promise<{ ok: boolean; latency_ms: number; text?: string; error?: string }> {
  const cfg = llmConfigForRun();
  const provider = (override?.provider ?? cfg.provider) as 'mock' | 'openai_compat' | 'ollama';
  let base_url: string | null = override?.base_url?.trim() || cfg.base_url || null;
  let model: string | null = override?.model?.trim() || cfg.model || null;
  let api_key: string | null = override?.api_key?.trim() || cfg.api_key || null;
  if (provider === 'openai_compat') {
    base_url = base_url || 'https://api.z.ai/api/coding/paas/v4';
    model = model || 'glm-5.3-flash';
  } else if (provider === 'ollama') {
    base_url = base_url || 'http://127.0.0.1:11434';
    model = model || 'qwen3:8b';
  }
  if (provider !== 'mock' && (!base_url || !model)) {
    return { ok: false, latency_ms: 0, error: 'ต้องระบุ base URL และโมเดล' };
  }
  if (provider === 'openai_compat' && !api_key) {
    return { ok: false, latency_ms: 0, error: 'ยังไม่มี API key (กรอกแล้วกดทดสอบ หรือบันทึกก่อน)' };
  }

  const started = Date.now();
  return await new Promise((resolve) => {
    const payload = {
      protocol: 1,
      prompt: 'Reply with exactly: OK',
      system_prompt: '',
      messages: [],
      config: { provider, base_url, model, api_key, max_turns: 1 },
      tools: [],
    };
    const child = spawn(ENGINE, [], { stdio: ['pipe', 'pipe', 'ignore'] });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ ok: false, latency_ms: Date.now() - started, error: 'หมดเวลา 15 วินาที — ตรวจ base URL / เครือข่าย' });
    }, 15_000);
    let buf = '';
    child.stdout.on('data', (c: Buffer) => {
      buf += c.toString();
      for (const line of buf.split('\n')) {
        let frame: any;
        try { frame = JSON.parse(line); } catch { continue; }
        if (frame?.kind === 'done') {
          clearTimeout(timer);
          child.kill();
          resolve({
            ok: Boolean(frame.ok),
            latency_ms: Date.now() - started,
            text: String(frame.text ?? '').slice(0, 120),
            error: frame.ok ? undefined : String(frame.error ?? frame.stop_reason ?? 'unknown'),
          });
          return;
        }
      }
      buf = buf.slice(buf.lastIndexOf('\n') + 1);
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, latency_ms: Date.now() - started, error: String(e) });
    });
    child.stdin.write(JSON.stringify(payload) + '\n');
  });
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'POST' && req.url === '/api/chat') {
    try { await runEngine(await readBody(req), res); }
    catch (e: any) { if (!res.headersSent) { res.writeHead(400); } res.end(JSON.stringify({ error: String(e?.message ?? e) })); }
    return;
  }

  // ---- Conversation history ----
  const convMatch = req.url?.match(/^\/api\/conversations\/([a-f0-9-]+)$/i);
  if (req.url === '/api/conversations' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ conversations: historyStore?.list() ?? [] }));
    return;
  }
  if (req.url === '/api/conversations' && req.method === 'POST') {
    if (!historyStore) { res.writeHead(503); res.end('{}'); return; }
    const body = await readBody(req).catch(() => null);
    const conv = historyStore.save({
      title: typeof body?.title === 'string' ? body.title : undefined,
      messages: Array.isArray(body?.messages) ? body.messages : [],
    });
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(conv));
    return;
  }
  if (convMatch) {
    const id = convMatch[1];
    if (req.method === 'GET') {
      const conv = historyStore?.get(id) ?? null;
      if (!conv) { res.writeHead(404); res.end('{}'); } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(conv));
      }
      return;
    }
    if (req.method === 'PUT') {
      if (!historyStore) { res.writeHead(503); res.end('{}'); return; }
      const body = await readBody(req).catch(() => null);
      try {
        const conv = historyStore.save({
          id,
          title: typeof body?.title === 'string' ? body.title : undefined,
          messages: Array.isArray(body?.messages) ? (body.messages as HistoryMessage[]) : [],
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(conv));
      } catch (e: any) {
        res.writeHead(404); res.end(JSON.stringify({ error: String(e?.message ?? e) }));
      }
      return;
    }
    if (req.method === 'DELETE') {
      const ok = historyStore?.delete(id) ?? false;
      res.writeHead(ok ? 200 : 404); res.end('{}');
      return;
    }
  }

  // ---- Skills (SKILL.md) ----
  const skillMatch = req.url?.match(/^\/api\/skills\/([a-z0-9-]+)$/);
  if (req.url === '/api/skills' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ skills: skillStore?.list() ?? [] }));
    return;
  }
  if (req.url === '/api/skills' && req.method === 'POST') {
    if (!skillStore) { res.writeHead(503); res.end('{}'); return; }
    const body = await readBody(req).catch(() => null);
    try {
      const skill = skillStore.save({
        name: String(body?.name ?? ''),
        description: String(body?.description ?? ''),
        body: String(body?.body ?? ''),
        mode: 'create',
      });
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(skill));
    } catch (e: any) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e?.message ?? e) }));
    }
    return;
  }
  if (skillMatch) {
    const name = skillMatch[1];
    if (req.method === 'GET') {
      const skill = skillStore?.get(name) ?? null;
      if (!skill) { res.writeHead(404); res.end('{}'); } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(skill));
      }
      return;
    }
    if (req.method === 'PUT') {
      if (!skillStore) { res.writeHead(503); res.end('{}'); return; }
      const body = await readBody(req).catch(() => null);
      try {
        const existing = skillStore.get(name);
        if (!existing) throw new Error(`ไม่พบ skill "${name}"`);
        const skill = skillStore.save({
          name,
          description: String(body?.description ?? existing.description),
          body: String(body?.body ?? ''),
          mode: 'update',
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(skill));
      } catch (e: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e?.message ?? e) }));
      }
      return;
    }
    if (req.method === 'DELETE') {
      const ok = skillStore?.delete(name) ?? false;
      res.writeHead(ok ? 200 : 404); res.end('{}');
      return;
    }
  }

  if (req.method === 'POST' && req.url === '/api/settings/test') {
    const body = await readBody(req).catch(() => null);
    const result = await testLlmConnection({
      provider: typeof body?.provider === 'string' ? body.provider : undefined,
      base_url: typeof body?.base_url === 'string' ? body.base_url : undefined,
      model: typeof body?.model === 'string' ? body.model : undefined,
      api_key: typeof body?.api_key === 'string' && body.api_key.trim() !== '' ? body.api_key : undefined,
    });
    console.log(`[settings] test ${body?.provider}: ok=${result.ok} ${result.latency_ms}ms`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  if (req.url === '/api/settings') {
    if (!settingsStore) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'settings store not configured' }));
      return;
    }
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(settingsStore.view()));
      return;
    }
    if (req.method === 'PUT') {
      const body = await readBody(req).catch(() => null);
      const provider = body?.provider;
      if (!['mock', 'openai_compat', 'ollama'].includes(provider)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'provider must be mock | openai_compat | ollama' }));
        return;
      }
      const saved = settingsStore.save({
        provider,
        base_url: typeof body?.base_url === 'string' ? body.base_url : undefined,
        model: typeof body?.model === 'string' ? body.model : undefined,
        api_key: typeof body?.api_key === 'string' ? body.api_key : undefined,
      });
      console.log(`[settings] saved provider=${saved.provider} model=${saved.model ?? '-'} secure=${Boolean(saved.api_key_cipher)}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(settingsStore.view()));
      return;
    }
  }

  if (req.method === 'POST' && req.url === '/api/action') {
    const body = await readBody(req as any).catch(() => ({}) as ChatBody);
    console.log('[action round-trip]', JSON.stringify(body));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ received: true, note: 'adapter ได้รับ action จากการ์ด A2UI แล้ว (PoC)' }));
    return;
  }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    const index = path.join(APP_DIST, 'index.html');
    if (existsSync(index)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(readFileSync(index));
      return;
    }
  }

  // Static assets from the built Vite app (production-style single origin).
  const asset = path.join(APP_DIST, decodeURIComponent((req.url ?? '/').split('?')[0]));
  if (req.method === 'GET' && asset.startsWith(APP_DIST) && existsSync(asset)) {
    const ext = path.extname(asset);
    const types: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
    res.writeHead(200, { 'Content-Type': types[ext] ?? 'application/octet-stream' });
    res.end(readFileSync(asset));
    return;
  }

  res.writeHead(404); res.end('not found');
});

// Library module: exports the server without side effects. The standalone
// entry (standalone.ts) and the Electron main both import from here.
export function startServer(opts?: { port?: number; host?: string; enginePath?: string; appDist?: string; settingsPath?: string; historyPath?: string; skillsPath?: string; enableFsTools?: boolean; secureStore?: SecureStore }) {
  const port = opts?.port ?? PORT;
  const host = opts?.host ?? HOST;
  if (opts?.enginePath) ENGINE = opts.enginePath;
  if (opts?.appDist) APP_DIST = opts.appDist;
  if (opts?.settingsPath) settingsStore = new SettingsStore(opts.settingsPath, opts?.secureStore);
  if (opts?.historyPath) historyStore = new HistoryStore(opts.historyPath);
  if (opts?.skillsPath) skillStore = new SkillStore(opts.skillsPath);
  if (opts?.enableFsTools) fsToolsForced = true;
  return new Promise<ReturnType<typeof server.listen>>((resolve) => {
    const handle = server.listen(port, host, () => {
      console.log(`sagent-a2ui adapter on http://${host}:${port} | provider=${settingsStore ? settingsStore.view().provider : ENV_PROVIDER} | engine=${ENGINE}`);
      resolve(handle);
    });
  });
}
