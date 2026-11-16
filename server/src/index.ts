// sagent-a2ui PoC adapter: HTTP+SSE front for the sagent-engine JSONL protocol.
// Wire: browser --SSE--> this adapter --stdin JSONL--> sagent-engine (subprocess)
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SettingsStore, type SecureStore } from './settings.js';
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
const ENABLE_FS_TOOLS = process.env.SAGENT_ENABLE_FS_TOOLS === '1';

let settingsStore: SettingsStore | null = null;

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
  if (ENABLE_FS_TOOLS) defs.push(...DESKTOP_TOOLS);
  return defs;
}

function executeTool(name: string, args: Record<string, unknown>): unknown {
  if (name === 'demo') return { ok: true, by: 'adapter' };
  if (ENABLE_FS_TOOLS && DESKTOP_TOOLS.some((t) => t.name === name)) {
    return executeDesktopTool(name, args);
  }
  throw new Error(`unknown tool: ${name}`);
}

// v1.0 basic catalog id (must be the exact URI the client catalog declares).
const BASIC_CATALOG_ID = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json';

// A2UI v1.0 contract taught to the agent: a fenced ```a2ui block carrying an
// array of v1.0 envelope messages, rendered by @a2ui/web_core on the client.
const SYSTEM_PROMPT = `คุณคือ assistant ภาษาไทยของแอป desktop เมื่อผู้ใช้ต้องการการ์ด/ฟอร์ม/ตาราง
ให้ตอบข้อความสั้น ๆ แล้วแนบบล็อกโค้ด \`\`\`a2ui ท้ายคำตอบ ภายในเป็น JSON array ของ A2UI v1.0 messages
ตามตัวอย่างนี้เป๊ะ ๆ (เปลี่ยนแต่ข้อมูล/ข้อความ ห้ามเปลี่ยนโครงสร้าง):

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

กติกา: หากผู้ใช้ไม่ขอการ์ด อย่าแนบบล็อก a2ui ตอบข้อความธรรมดา ตอบสั้นกระชับ`;

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
  const payload = {
    protocol: 1,
    prompt,
    system_prompt: config.provider === 'openai_compat' ? SYSTEM_PROMPT : '',
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

  rl.on('line', (line) => {
    let frame: any;
    try { frame = JSON.parse(line); } catch { return; }
    if (frame.kind === 'event' && frame.event?.type === 'messageUpdate') {
      // sagent streams deltas; forward as-is for the client to assemble.
      sseSend(res, 'delta', frame.event);
    } else if (frame.kind === 'tool_request') {
      sseSend(res, 'tool', { name: frame.name, arguments: frame.arguments });
      let reply: Record<string, unknown>;
      try {
        reply = { protocol: 1, kind: 'tool_result', id: frame.id, result: executeTool(frame.name, frame.arguments ?? {}) };
      } catch (e: any) {
        reply = { protocol: 1, kind: 'tool_result', id: frame.id, error: String(e?.message ?? e).slice(0, 400) };
      }
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
export function startServer(opts?: { port?: number; host?: string; enginePath?: string; appDist?: string; settingsPath?: string; secureStore?: SecureStore }) {
  const port = opts?.port ?? PORT;
  const host = opts?.host ?? HOST;
  if (opts?.enginePath) ENGINE = opts.enginePath;
  if (opts?.appDist) APP_DIST = opts.appDist;
  if (opts?.settingsPath) settingsStore = new SettingsStore(opts.settingsPath, opts?.secureStore);
  return new Promise<ReturnType<typeof server.listen>>((resolve) => {
    const handle = server.listen(port, host, () => {
      console.log(`sagent-a2ui adapter on http://${host}:${port} | provider=${settingsStore ? settingsStore.view().provider : ENV_PROVIDER} | engine=${ENGINE}`);
      resolve(handle);
    });
  });
}
