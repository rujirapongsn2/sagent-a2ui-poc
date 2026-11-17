import { useEffect, useRef, useState } from 'react';
import { MessageProcessor } from '@a2ui/web_core';
import { basicCatalog } from '@a2ui/web_core/catalogs/basic/v1';
import { A2uiSurface } from '@a2ui/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './fonts.css';
import './tokens.css';
import './app.css';

/* ---------- Lucide-style line icons (single stroke source, no dependency) ---------- */
const sw = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const Icon = {
  Menu: (p: any) => <svg width={20} height={20} viewBox="0 0 24 24" {...sw} {...p}><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>,
  Chat: (p: any) => <svg width={18} height={18} viewBox="0 0 24 24" {...sw} {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
  History: (p: any) => <svg width={18} height={18} viewBox="0 0 24 24" {...sw} {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></svg>,
  Plug: (p: any) => <svg width={18} height={18} viewBox="0 0 24 24" {...sw} {...p}><path d="M9 2v6M15 2v6" /><path d="M6 8h12v4a6 6 0 0 1-12 0z" /><path d="M12 18v4" /></svg>,
  Settings: (p: any) => <svg width={18} height={18} viewBox="0 0 24 24" {...sw} {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
  Sparkles: (p: any) => <svg width={18} height={18} viewBox="0 0 24 24" {...sw} {...p}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" /></svg>,
  Send: (p: any) => <svg width={17} height={17} viewBox="0 0 24 24" {...sw} {...p}><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></svg>,
  Chevron: (p: any) => <svg width={16} height={16} viewBox="0 0 24 24" {...sw} {...p}><path d="m6 9 6 6 6-6" /></svg>,
  Check: (p: any) => <svg width={14} height={14} viewBox="0 0 24 24" {...sw} {...p}><path d="M20 6 9 17l-5-5" /></svg>,
  Trash: (p: any) => <svg width={16} height={16} viewBox="0 0 24 24" {...sw} {...p}><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
  Search: (p: any) => <svg width={14} height={14} viewBox="0 0 24 24" {...sw} {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>,
  FileText: (p: any) => <svg width={14} height={14} viewBox="0 0 24 24" {...sw} {...p}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" /><path d="M14 2v5h6" /><path d="M9 13h6M9 17h6" /></svg>,
  FilePlus: (p: any) => <svg width={14} height={14} viewBox="0 0 24 24" {...sw} {...p}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" /><path d="M14 2v5h6" /><path d="M12 11v6M9 14h6" /></svg>,
  Folder: (p: any) => <svg width={14} height={14} viewBox="0 0 24 24" {...sw} {...p}><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.2 3.9A2 2 0 0 0 7.5 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" /></svg>,
  Eye: (p: any) => <svg width={14} height={14} viewBox="0 0 24 24" {...sw} {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>,
  Box: (p: any) => <svg width={14} height={14} viewBox="0 0 24 24" {...sw} {...p}><path d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z" /><path d="m3.3 7 8.7 5 8.7-5M12 22V12" /></svg>,
  AlertCircle: (p: any) => <svg width={14} height={14} viewBox="0 0 24 24" {...sw} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>,
};

interface ToolCall {  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: 'running' | 'done' | 'error';
  latency_ms?: number;
  result?: unknown;
  error?: string;
}

/** A file staged for the next message (already stored server-side). */
interface Attachment {
  id: string;
  name: string;
  path: string;
  kind: 'text' | 'image' | 'binary';
  size: number;
}

/** native picker (desktop app) — window.sagentDesktop comes from preload.js */
async function pickAndUpload(): Promise<Attachment[]> {
  const bridge = (window as any).sagentDesktop;
  if (bridge?.pickFiles) {
    const paths: string[] | null = await bridge.pickFiles();
    if (!paths?.length) return [];
    const res = await fetch('/api/uploads', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paths }),
    });
    if (!res.ok) throw new Error(`upload ${res.status}`);
    return (await res.json()).attachments ?? [];
  }
  // Web fallback: the caller opens <input type=file> instead.
  return [];
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Hide the raw ```a2ui wire block from the rendered reply — the card itself
 *  is the presentation; the JSON is transport, not user-facing content.
 *  Also hides the unterminated block while it is still streaming in. */
function displayContent(content: string): string {
  return content
    .replace(/```a2ui[\s\S]*?```/g, '')
    .replace(/```a2ui[\s\S]*$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  a2uiMessages?: unknown[];
  toolCalls?: ToolCall[];
  /** Files attached with this message — kept in the transcript so the
   *  conversation's attachment context survives follow-up turns. */
  attachments?: Attachment[];
  /** Token usage reported by the engine on completion. */
  usage?: { input?: number; output?: number; totalTokens?: number };
  /** true when tokens were estimated (engine did not forward real usage). */
  usageEstimated?: boolean;
  /** User feedback on this answer (local for now). */
  feedback?: 'like' | 'dislike' | null;
}

/* Parse an SSE stream from a fetch Response without extra dependencies. */
async function* sseStream(res: Response) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = 'message';
      let data = '';
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7).trim();
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      if (data) yield { event, data: JSON.parse(data) };
    }
  }
}


/* ---------- Tool activity transcript (system truth, not model prose) ---------- */
const TOOL_META: Record<string, { icon: any; verb: string }> = {
  web_search: { icon: Icon.Search, verb: 'ค้นหาออนไลน์' },
  read_text_file: { icon: Icon.FileText, verb: 'อ่านไฟล์' },
  write_file: { icon: Icon.FileText, verb: 'เขียนไฟล์' },
  create_file: { icon: Icon.FilePlus, verb: 'สร้างไฟล์' },
  list_directory: { icon: Icon.Folder, verb: 'ดูโฟลเดอร์' },
  reveal_path: { icon: Icon.Eye, verb: 'เปิดใน file manager' },
  demo: { icon: Icon.Box, verb: 'ทดสอบระบบ' },
};

function argSummary(name: string, args: Record<string, unknown>): string {
  if (name === 'web_search') return String(args?.query ?? '');
  if (typeof args?.path === 'string') return args.path;
  return JSON.stringify(args);
}

function ToolCallRow({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false);
  const meta = TOOL_META[call.name] ?? { icon: Icon.Box, verb: call.name };
  const IconCmp = meta.icon;
  const running = call.status === 'running';
  const failed = call.status === 'error';
  return (
    <div className={`tool-call${failed ? ' tool-call--error' : ''}`}>
      <button
        className="tool-call__head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        type="button"
      >
        <span className={`tool-call__icon${running ? ' tool-call__icon--running' : ''}`}>
          {failed ? <Icon.AlertCircle /> : <IconCmp />}
        </span>
        <span className="tool-call__label">
          {running ? `${meta.verb}…` : `${meta.verb} · ${call.name}`}
        </span>
        {!running && (
          <span className={`tool-call__meta${failed ? ' tool-call__meta--error' : ''}`}>
            {failed ? '✕ ' : '✓ '}{call.latency_ms ?? 0} ms
          </span>
        )}
        <Icon.Chevron style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
      </button>
      {open && (
        <div className="tool-call__body">
          <div className="tool-call__section">ARGS</div>
          <pre className="tool-call__json">{JSON.stringify(call.arguments, null, 2)}</pre>
          {failed ? (
            <>
              <div className="tool-call__section">ERROR</div>
              <pre className="tool-call__json tool-call__json--error">{call.error}</pre>
            </>
          ) : call.result !== undefined ? (
            <>
              <div className="tool-call__section">RESULT</div>
              <pre className="tool-call__json">{JSON.stringify(call.result, null, 2)}</pre>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ---------- A2UI card (v1.0) rendered inside an assistant bubble ---------- */
function A2uiCard({ messages, onAction }: { messages: unknown[]; onAction: (payload: unknown) => void }) {
  // The processor's 2nd argument is the ActionListener: every dispatched
  // action (e.g. Button press) lands here — the renderer→agent half of the
  // round-trip.
  const actionRef = useRef(onAction);
  actionRef.current = onAction;
  const [processor] = useState(
    () => new MessageProcessor([basicCatalog], (action) => actionRef.current?.(action)),
  );
  const [surfaces, setSurfaces] = useState(() => Array.from(processor.model.surfacesMap.values()));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setError(null);
      processor.processMessages(messages as any);
    } catch (e: any) {
      console.error('[a2ui] process failed', e);
      setError(String(e?.message ?? e).slice(0, 300));
    }
    // processMessages runs synchronously: surface-created events fire before
    // the subscriptions below attach, so sync the snapshot explicitly.
    setSurfaces(Array.from(processor.model.surfacesMap.values()));
    const subs = [
      processor.onSurfaceCreated(() => setSurfaces(Array.from(processor.model.surfacesMap.values()))),
      processor.onSurfaceDeleted(() => setSurfaces(Array.from(processor.model.surfacesMap.values()))),
    ];
    return () => subs.forEach((s: any) => s.unsubscribe?.());
  }, [messages]);

  if (error) return <div className="a2ui-error">[a2ui] {error}</div>;
  if (surfaces.length === 0) return null;
  return (
    <div className="a2ui-card">
      {surfaces.map((s: any) => (
        <A2uiSurface key={s.id} surface={s} />
      ))}
    </div>
  );
}


/* ---------- Settings (provider config → OS keychain) ---------- */
function SettingsPanel() {
  const [form, setForm] = useState<{provider: string; base_url: string; model: string; api_key: string} | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((d) => {
      // Mock is dev-only (env) — never offered in the UI; treat it as unconfigured.
      const provider = d.provider === 'mock' ? 'openai_compat' : d.provider;
      setForm({ provider, base_url: d.base_url ?? '', model: d.model ?? '', api_key: '' });
    }).catch(() => setForm({ provider: 'mock', base_url: '', model: '', api_key: '' }));
  }, []);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; latency_ms: number; text?: string; error?: string } | null>(null);

  async function testConnection() {
    if (!form || testing) return;
    setTesting(true); setTestResult(null); setSaved(null); setError(null);
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: form.provider,
          base_url: form.base_url,
          model: form.model,
          ...(form.api_key.trim() !== '' ? { api_key: form.api_key } : {}),
        }),
      });
      setTestResult(await res.json());
    } catch (e: any) {
      setTestResult({ ok: false, latency_ms: 0, error: String(e?.message ?? e) });
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    if (!form || busy) return;
    setBusy(true); setSaved(null); setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: form.provider,
          base_url: form.base_url,
          model: form.model,
          ...(form.api_key.trim() !== '' ? { api_key: form.api_key } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setSaved('บันทึกแล้ว');
      setForm((f) => f ? { ...f!, api_key: '' } : f);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
      void persistConversation();
    }
  }

  if (!form) return <div className="chat"><div className="chat__inner"><p className="hero__sub">กำลังโหลดการตั้งค่า…</p></div></div>;

  const isLive = form.provider === 'openai_compat' || form.provider === 'ollama';
  return (
    <div className="chat">
      <div className="chat__inner" style={{ maxWidth: 560, paddingTop: 'var(--sp-6)' }}>
        <h2 className="hero__title" style={{ fontSize: 'var(--fs-heading)', textAlign: 'left', marginTop: 0 }}>
          การเชื่อมต่อ <span className="grad">AI engine</span>
        </h2>
        <p className="hero__sub" style={{ textAlign: 'left', margin: 0, marginBottom: 'var(--sp-6)' }}>
          เลือกผู้ให้บริการโมเดล — คีย์ถูกเก็บด้วยระบบ keystore ของเครื่อง (Keychain / Credential Manager)
        </p>

        <label className="field">
          <span className="field__label">ผู้ให้บริการ</span>
          <div className="field__row">
            {([
              ['openai_compat', 'OpenAI-compatible (GLM ฯลฯ)'],
              ['ollama', 'Ollama (ออฟไลน์)'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                className={`chip${form.provider === value ? ' chip--active' : ''}`}
                onClick={() => setForm({ ...form, provider: value })}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </label>

        {isLive && (
          <>
            <label className="field">
              <span className="field__label">{form.provider === 'ollama' ? 'Base URL (เช่น http://127.0.0.1:11434 — เว้นว่างใช้ค่าเริ่มต้น)' : 'Base URL'}</span>
              <input
                className="input"
                value={form.base_url}
                onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                placeholder={form.provider === 'ollama' ? 'http://127.0.0.1:11434' : 'https://api.z.ai/api/coding/paas/v4'}
              />
            </label>
            <label className="field">
              <span className="field__label">โมเดล</span>
              <input
                className="input"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder={form.provider === 'ollama' ? 'qwen3:8b' : 'glm-5.3-flash'}
              />
            </label>
            {form.provider === 'openai_compat' && (
              <label className="field">
                <span className="field__label">API key</span>
                <input
                  className="input"
                  type="password"
                  value={form.api_key}
                  onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                  placeholder="เว้นว่าง = ใช้คีย์เดิมที่บันทึกไว้"
                  autoComplete="off"
                />
              </label>
            )}
          </>
        )}

        <div className="field__row" style={{ marginTop: 'var(--sp-6)' }}>
          <button className="btn" onClick={save} disabled={busy} type="button">
            <Icon.Check /> {busy ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}
          </button>
          {form.provider !== 'mock' && (
            <button className="btn btn--ghost" onClick={testConnection} disabled={testing} type="button">
              {testing ? 'กำลังทดสอบ…' : 'ทดสอบการเชื่อมต่อ'}
            </button>
          )}
          {saved && <span style={{ color: 'var(--accent)', fontSize: 'var(--fs-label)' }}>{saved}</span>}
          {error && <span className="a2ui-error">{error}</span>}
          {testResult && (
            <div
              role="status"
              className="test-result"
              style={{
                width: '100%',
                marginTop: 'var(--sp-2)',
                padding: '10px 14px',
                borderRadius: 'var(--r-control)',
                border: `1px solid ${testResult.ok ? '#C8E6D2' : '#F3D4D1'}`,
                background: testResult.ok ? 'rgba(33, 110, 78, 0.05)' : 'rgba(174, 46, 36, 0.04)',
                fontSize: 'var(--fs-label)',
                color: testResult.ok ? '#216E4E' : '#AE2E24',
              }}
            >
              {testResult.ok
                ? `เชื่อมต่อสำเร็จ · ${testResult.latency_ms} ms · ตอบ: "${testResult.text ?? ''}"`
                : `ไม่สำเร็จ · ${testResult.error ?? 'unknown'}`}
            </div>
          )}
        </div>

        <UpdateSection />
      </div>
    </div>
  );
}

/* ---------- App update (desktop only) ---------- */
interface UpdateStateInfo {
  supported: boolean;
  status: 'idle' | 'checking' | 'uptodate' | 'available' | 'downloading' | 'downloaded' | 'error';
  currentVersion: string;
  newVersion: string | null;
  progress: number;
  error: string | null;
}

function UpdateSection() {
  const bridge = (window as any).sagentDesktop;
  const [state, setState] = useState<UpdateStateInfo | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Poll update state while mounted (progress ticks during download).
  useEffect(() => {
    if (!bridge?.updateState) return;
    let alive = true;
    const poll = async () => {
      try {
        const s: UpdateStateInfo = await bridge.updateState();
        if (alive) setState(s);
      } catch { /* bridge gone */ }
    };
    void poll();
    const t = setInterval(poll, 1000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!bridge?.updateState) return null; // web dev: no updater
  if (state && !state.supported) return null; // not packaged / no feed

  const statusText: Record<string, string> = {
    idle: 'ยังไม่ได้ตรวจ',
    checking: 'กำลังตรวจสอบ…',
    uptodate: 'แอปเป็นเวอร์ชันล่าสุดแล้ว',
    available: `พบเวอร์ชันใหม่ ${state?.newVersion ?? ''}`,
    downloading: `กำลังดาวน์โหลด ${state?.progress ?? 0}%`,
    downloaded: 'ดาวน์โหลดเสร็จ — พร้อมติดตั้ง',
    error: 'ตรวจสอบไม่สำเร็จ (อาจออฟไลน์)',
  };

  return (
    <div className="field__row" style={{ marginTop: 'var(--sp-6)', paddingTop: 'var(--sp-5)', borderTop: '1px solid var(--border)', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--sp-3)' }}>
      <div>
        <strong style={{ fontSize: 'var(--fs-body-lg)' }}>อัปเดตแอป</strong>
        <div style={{ fontSize: 'var(--fs-label)', color: 'var(--text-secondary)', marginTop: 4 }}>
          เวอร์ชันปัจจุบัน {state?.currentVersion ?? '—'} · {state ? statusText[state.status] : '…'}
        </div>
      </div>

      {state?.status === 'downloading' && (
        <div style={{ width: '100%', height: 6, background: 'var(--accent-tint-strong)', borderRadius: 'var(--r-pill)', overflow: 'hidden' }}>
          <div style={{ width: `${state.progress}%`, height: '100%', background: 'var(--accent)', transition: 'width 300ms ease' }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
        {(state?.status === 'idle' || state?.status === 'error' || state?.status === 'uptodate') && (
          <button className="btn" onClick={() => bridge.updateCheck()} type="button">ตรวจหาอัปเดต</button>
        )}
        {state?.status === 'available' && (
          <button className="btn" onClick={() => bridge.updateDownload()} type="button">ดาวน์โหลดเวอร์ชันใหม่</button>
        )}
        {state?.status === 'downloaded' && !confirming && (
          <button className="btn btn--send" style={{ padding: '10px 18px' }} onClick={() => setConfirming(true)} type="button">
            ติดตั้งอัปเดต
          </button>
        )}
      </div>

      {confirming && state?.status === 'downloaded' && (
        <div role="alertdialog" aria-label="ยืนยันการรีสตาร์ท" style={{ width: '100%', padding: 'var(--sp-4)', border: '1px solid var(--border)', borderRadius: 'var(--r-card)', background: 'var(--accent-tint)' }}>
          <div style={{ fontSize: 'var(--fs-body)', marginBottom: 'var(--sp-3)' }}>
            การติดตั้งต้อง<strong>ปิดและเปิดแอปใหม่</strong> — ยืนยันที่จะรีสตาร์ทตอนนี้หรือไม่?
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <button className="btn btn--send" style={{ padding: '10px 18px' }} onClick={() => bridge.updateInstall()} type="button">
              รีสตาร์ทเลย
            </button>
            <button className="btn btn--ghost" onClick={() => setConfirming(false)} type="button">
              ภายหลัง (ติดตั้งตอนปิดแอป)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}



/* ---------- Skills (SKILL.md) management ---------- */
interface SkillItem { name: string; description: string; version?: string }

function SkillsPanel() {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [editing, setEditing] = useState<{ mode: 'create' | 'update'; name: string; description: string; body: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const res = await fetch('/api/skills');
      const data = await res.json();
      if (Array.isArray(data.skills)) setSkills(data.skills);
    } catch { /* keep */ }
  }
  useEffect(() => { void refresh(); }, []);

  async function loadForEdit(name: string) {
    setError(null);
    try {
      const res = await fetch(`/api/skills/${name}`);
      const skill = await res.json();
      const body = String(skill.markdown ?? '').replace(/^---[\s\S]*?---\n?/, '');
      setEditing({ mode: 'update', name, description: skill.description ?? '', body });
    } catch (e: any) { setError(String(e?.message ?? e)); }
  }

  async function save() {
    if (!editing || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(editing.mode === 'create' ? '/api/skills' : `/api/skills/${editing.name}`, {
        method: editing.mode === 'create' ? 'POST' : 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: editing.name, description: editing.description, body: editing.body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setEditing(null);
      void refresh();
    } catch (e: any) { setError(String(e?.message ?? e)); } finally { setBusy(false); }
  }

  async function remove(name: string) {
    await fetch(`/api/skills/${name}`, { method: 'DELETE' }).catch(() => null);
    void refresh();
  }

  return (
    <div className="chat">
      <div className="chat__inner" style={{ maxWidth: 640, paddingTop: 'var(--sp-6)' }}>
        <div className="field__row" style={{ justifyContent: 'space-between', marginBottom: 'var(--sp-6)', width: '100%' }}>
          <h2 className="hero__title" style={{ fontSize: 'var(--fs-heading)', margin: 0 }}>
            <span className="grad">ทักษะ</span>ของผู้ช่วย
          </h2>
          <button className="btn" type="button" onClick={() => setEditing({ mode: 'create', name: '', description: '', body: '' })}>
            <Icon.FilePlus /> สร้างทักษะ
          </button>
        </div>

        {error && <div className="a2ui-error" style={{ marginBottom: 'var(--sp-3)' }}>{error}</div>}

        {editing && (
          <div className="skill-editor">
            <label className="field">
              <span className="field__label">ชื่อ (a-z 0-9 ขีดกลาง{editing.mode === 'update' ? ' — แก้ไม่ได้' : ''})</span>
              <input className="input" value={editing.name} disabled={editing.mode === 'update'}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="เช่น meeting-notes" />
            </label>
            <label className="field">
              <span className="field__label">คำอธิบาย ({editing.description.length}/60)</span>
              <input className="input" value={editing.description} maxLength={60}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder="Use when ต้องการ… (≤60 ตัวอักษร)" />
            </label>
            <label className="field">
              <span className="field__label">เนื้อหา (markdown — ไม่ต้องใส่ --- frontmatter)</span>
              <textarea className="input skill-editor__body" value={editing.body} rows={10}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                placeholder={'# ชื่อทักษะ\n\nเมื่อไหร่ใช้ / ขั้นตอน / ข้อควรระวัง'} />
            </label>
            <div className="field__row">
              <button className="btn" onClick={save} disabled={busy} type="button">
                <Icon.Check /> {busy ? 'กำลังบันทึก…' : editing.mode === 'create' ? 'สร้าง' : 'บันทึกการแก้ไข'}
              </button>
              <button className="btn btn--ghost" onClick={() => setEditing(null)} type="button">ยกเลิก</button>
            </div>
          </div>
        )}

        {skills.length === 0 && !editing && (
          <p className="hero__sub" style={{ textAlign: 'left' }}>ยังไม่มีทักษะ — สร้างเอง หรือสั่งผู้ช่วยในแชทก็ได้ ("ช่วยสร้าง skill สำหรับ…")</p>
        )}
        {skills.map((sk) => (
          <div key={sk.name} className="conv-row">
            <button className="conv-row__main" onClick={() => loadForEdit(sk.name)} type="button">
              <span className="conv-row__title">{sk.name}{sk.version ? <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}> · v{sk.version}</span> : null}</span>
              <span className="conv-row__date" style={{ whiteSpace: 'normal' }}>{sk.description}</span>
            </button>
            <button className="btn btn--ghost btn--icon" onClick={() => remove(sk.name)} aria-label={`ลบ ${sk.name}`} type="button">
              <Icon.Trash />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Conversation history ---------- */
function HistoryPanel({ conversations, onOpen, onDelete, onNew }: {
  conversations: Array<{ id: string; title: string; updated_at: string }>;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="chat">
      <div className="chat__inner" style={{ maxWidth: 640, paddingTop: 'var(--sp-6)' }}>
        <div className="field__row" style={{ justifyContent: 'space-between', marginBottom: 'var(--sp-6)', width: '100%' }}>
          <h2 className="hero__title" style={{ fontSize: 'var(--fs-heading)', margin: 0 }}>
            <span className="grad">ประวัติ</span>บทสนทนา
          </h2>
          <button className="btn" onClick={onNew} type="button"><Icon.Chat /> บทสนทนาใหม่</button>
        </div>
        {conversations.length === 0 && (
          <p className="hero__sub" style={{ textAlign: 'left' }}>ยังไม่มีบทสนทนาที่บันทึกไว้</p>
        )}
        {conversations.map((c) => (
          <div key={c.id} className="conv-row">
            <button className="conv-row__main" onClick={() => onOpen(c.id)} type="button">
              <span className="conv-row__title">{c.title || 'บทสนทนา'}</span>
              <span className="conv-row__date">
                {new Date(c.updated_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            </button>
            <button className="btn btn--ghost btn--icon" onClick={() => onDelete(c.id)} aria-label={`ลบ ${c.title}`} type="button">
              <Icon.Trash />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  'ช่วยจองโต๊ะอาหาร 4 คน พร้อมการ์ดยืนยัน',
  'อธิบายว่าการ์ด A2UI ทำงานอย่างไร',
];

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  // Elapsed-seconds ticker while the agent works — pairs with the activity
  // line so a long tool run never looks like a hang.
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);
  const [actionAck, setActionAck] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [view, setView] = useState<'chat' | 'settings' | 'history' | 'skills'>('chat');
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Array<{ id: string; title: string; updated_at: string }>>([]);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => { scroller.current?.scrollTo({ top: 1e9 }); }, [messages, actionAck]);

  async function refreshConversations() {
    try {
      const res = await fetch('/api/conversations');
      const data = await res.json();
      if (Array.isArray(data.conversations)) setConversations(data.conversations);
    } catch { /* offline list stays */ }
  }

  useEffect(() => { if (view === 'history') void refreshConversations(); }, [view]);

  function newConversation() {
    setMessages([]);
    setActiveConvId(null);
    setView('chat');
  }

  async function openConversation(id: string) {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) return;
      const conv = await res.json();
      setMessages((conv.messages ?? []).map((m: any) => ({ role: m.role, content: m.content, a2uiMessages: m.a2uiMessages, toolCalls: m.toolCalls, attachments: m.attachments })));
      setActiveConvId(id);
      setView('chat');
    } catch { /* keep list */ }
  }

  async function deleteConversation(id: string) {
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' }).catch(() => null);
    void refreshConversations();
  }

  async function persistConversation() {
    if (messages.length === 0) return;
    try {
      const payload = JSON.stringify({
        title: messages.find((m) => m.role === 'user')?.content?.slice(0, 60),
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.a2uiMessages ? { a2uiMessages: m.a2uiMessages } : {}),
          ...(m.toolCalls ? { toolCalls: m.toolCalls } : {}),
        })),
      });
      const res = activeConvId
        ? await fetch(`/api/conversations/${activeConvId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: payload })
        : await fetch('/api/conversations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload });
      const conv = await res.json().catch(() => null);
      if (!activeConvId && conv?.id) setActiveConvId(conv.id);
    } catch { /* history is best-effort */ }
  }

  async function send(text?: string) {
    const message = (text ?? input).trim();
    const atts = pendingAttachments;
    if ((!message && !atts.length) || busy) return;
    setInput('');
    setPendingAttachments([]);
    setBusy(true);
    setElapsed(0);
    const history = messages
      .filter((m) => m.content)
      // Strip the a2ui wire blocks from history: the engine only needs the
      // conversational context (cuts tokens, stops the model echoing old JSON).
      .map((m) => ({ role: m.role, content: displayContent(m.content) }));
    // Conversation-scoped attachments: every file attached earlier in this
    // conversation rides along with each new message, so follow-ups like
    // "สรุปเป็น bullet points" still reach the file the user attached turns ago.
    const convAttachments: Attachment[] = [
      ...messages.flatMap((m) => (m.role === 'user' ? (m.attachments ?? []) : [])),
      ...atts,
    ];
    // The chat transcript shows a compact 📎 line so the attachment is part of
    // the remembered conversation.
    const displayMsg = message + (atts.length ? `\n\n📎 ${atts.map((a) => a.name).join(', ')}` : '');
    setMessages((prev) => [...prev, { role: 'user', content: displayMsg, attachments: atts.length ? atts : undefined }, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, history, attachments: convAttachments }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      let assistantText = '';
      for await (const { event, data } of sseStream(res)) {
        if (event === 'start') setProvider(data?.provider ?? null);
        if (event === 'tool' && data?.id) {
          const call: ToolCall = { id: data.id, name: data.name, arguments: data.arguments ?? {}, status: 'running' };
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') {
              last.toolCalls = [...(last.toolCalls ?? []), call];
            }
            return next;
          });
        }
        if (event === 'tool_result' && data?.id) {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            const calls = last?.toolCalls;
            if (last?.role === 'assistant' && calls) {
              const idx = calls.findIndex((c) => c.id === data.id);
              if (idx >= 0) {
                calls[idx] = {
                  ...calls[idx],
                  status: data.ok ? 'done' : 'error',
                  latency_ms: data.latency_ms,
                  result: data.result,
                  error: data.error,
                };
              }
            }
            return next;
          });
        }
        if (event === 'delta') {
          // Engine emits {delta:{delta:"…",type:"text"}}; the adapter's own
          // injected deltas use {delta:{text:"…"}} — accept both.
          const d = data?.delta ?? {};
          const piece: string = typeof d.text === 'string' ? d.text : (d.type === 'text' && typeof d.delta === 'string' ? d.delta : '');
          if (piece) {
            assistantText += piece;
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = { role: 'assistant', content: assistantText };
              return next;
            });
          }
        } else if (event === 'a2ui' && Array.isArray(data.messages)) {
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: assistantText, a2uiMessages: data.messages };
            return next;
          });
        } else if (event === 'done' && data?.ok === false) {
          assistantText += `\n[engine error: ${data.error ?? data.stop_reason}]`;
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: assistantText };
            return next;
          });
        } else if (event === 'done') {
          // ok run: attach the engine's token usage to the finished message
          const usage = data?.usage;
          const usageEstimated = data?.usage_estimated === true;
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') next[next.length - 1] = { ...last, usage, usageEstimated };
            return next;
          });
        }
      }
    } catch (e: any) {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: `[adapter error] ${e?.message ?? e}` };
        return next;
      });
    } finally {
      setBusy(false);
      void persistConversation();
    }
  }

  async function onAction(payload: unknown) {
    try {
      const res = await fetch('/api/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ payload, at: new Date().toISOString() }),
      });
      await res.json();
      setActionAck(`${new Date().toLocaleTimeString()} — ได้รับ action จากการ์ดแล้ว`);
      setTimeout(() => setActionAck(null), 4000);
    } catch {
      setActionAck('ส่ง action ไม่สำเร็จ');
      setTimeout(() => setActionAck(null), 4000);
    }
  }

  const lastIsTyping =
    busy && messages.length > 0 &&
    messages[messages.length - 1].role === 'assistant' &&
    !messages[messages.length - 1].content;

  return (
    <div className="shell">
      {menuOpen && <button className="sidebar-overlay" aria-label="ปิดเมนู" onClick={() => setMenuOpen(false)} />}

      <aside className={`sidebar${menuOpen ? ' sidebar--open' : ''}`}>
        <div className="sidebar__brand">
          <span className="hero__orb" style={{ width: 32, height: 32 }}><Icon.Sparkles width={15} height={15} /></span>
          <img src="softnix-logo.png" alt="Softnix" style={{ height: 22, width: 'auto', display: 'block' }} />
          <strong style={{ fontSize: 'var(--fs-title)', fontWeight: 600 }}>sagent</strong>
        </div>
        <nav className="sidebar__nav" aria-label="เมนูหลัก">
          <button
            className={`nav-item${view === 'chat' ? ' nav-item--active' : ''}`}
            onClick={() => { setView('chat'); setMenuOpen(false); }}
          >
            <Icon.Chat /> บทสนทนา
          </button>
          <button
            className={`nav-item${view === 'skills' ? ' nav-item--active' : ''}`}
            onClick={() => { setView('skills'); setMenuOpen(false); }}
          >
            <Icon.Box /> ทักษะ
          </button>
          <button
            className={`nav-item${view === 'history' ? ' nav-item--active' : ''}`}
            onClick={() => { setView('history'); setMenuOpen(false); }}
          >
            <Icon.History /> ประวัติ
          </button>
          <button className="nav-item" onClick={() => setMenuOpen(false)}>
            <Icon.Plug /> การเชื่อมต่อ
          </button>
          <button
            className={`nav-item${view === 'settings' ? ' nav-item--active' : ''}`}
            onClick={() => { setView('settings'); setMenuOpen(false); }}
          >
            <Icon.Settings /> การตั้งค่า
          </button>
        </nav>
        <div className="sidebar__footer">
          <span className="chip" style={{ cursor: 'default', boxShadow: 'none', background: 'transparent', color: 'var(--text-secondary)' }}>
            engine: sagent · A2UI v1.0
          </span>
        </div>
      </aside>

      <div className="main">
        <header className="toolbar">
          <button
            className="btn btn--ghost btn--icon mobile-only"
            aria-label="เปิดเมนู"
            onClick={() => setMenuOpen(true)}
          >
            <Icon.Menu />
          </button>
          <h1 className="toolbar__title">{view === 'settings' ? 'การตั้งค่า' : view === 'history' ? 'ประวัติ' : view === 'skills' ? 'ทักษะ' : 'บทสนทนา'}</h1>

          {view === 'chat' && (
            <button className="btn" onClick={newConversation} type="button" title="เริ่มบทสนทนาใหม่">
              <Icon.FilePlus /> บทสนทนาใหม่
            </button>
          )}

          <div className="dropdown">
            <button className="btn" onClick={() => setStatusOpen((v) => !v)} aria-expanded={statusOpen} aria-haspopup="menu">
              <Icon.Sparkles width={15} height={15} />
              {provider === 'openai_compat' ? 'OpenAI-compatible' : provider === 'ollama' ? 'Ollama' : 'AI engine'}
              <Icon.Chevron />
            </button>
            {statusOpen && (
              <div className="dropdown__menu" role="menu">
                <div className="dropdown__item dropdown__item--active" role="menuitem">
                  <span>{provider === 'openai_compat' ? 'OpenAI-compatible' : provider === 'ollama' ? 'Ollama' : 'ยังไม่ได้กำหนด'}</span>
                  <small>provider ที่ adapter ใช้อยู่ — สลับที่ server (SAGENT_PROVIDER)</small>
                </div>
                <div className="dropdown__item" role="menuitem" style={{ opacity: 0.6, cursor: 'default' }}>
                  <span>Ollama (offline)</span>
                  <small>พร้อมใช้ในเฟส 1</small>
                </div>
              </div>
            )}
          </div>
        </header>

        {view === 'settings' ? (
          <SettingsPanel />
        ) : view === 'skills' ? (
          <SkillsPanel />
        ) : view === 'history' ? (
          <HistoryPanel conversations={conversations} onOpen={openConversation} onDelete={deleteConversation} onNew={newConversation} />
        ) : (
        <div className="chat" ref={scroller}>
          {messages.length === 0 ? (
            <div className="hero">
              <span className="hero__orb"><Icon.Sparkles width={24} height={24} /></span>
              <h2 className="hero__title">สวัสดีครับ <span className="grad">มีอะไรให้ช่วย?</span></h2>
              <p className="hero__sub">ผู้ช่วย AI ที่ตอบข้อความและประกอบการ์ดอัตโนมัติ (A2UI v1.0) ได้ในบทสนทนา</p>
              <div className="hero__chips">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="chip" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="chat__inner">
              {messages.map((m, i) => (
                <div key={i} className={`msg msg--${m.role}`}>
                  {m.role === 'assistant' && (
                    <span className="msg__avatar msg__avatar--ai"><Icon.Sparkles width={13} height={13} /></span>
                  )}
                  <div className="msg__col">
                    {(m.toolCalls ?? []).map((c) => <ToolCallRow key={c.id} call={c} />)}
                    {/* Live activity: while this run is busy, always show what
                        the agent is doing (current tool / thinking) + elapsed
                        seconds — the UI must never look frozen. */}
                    {busy && i === messages.length - 1 && m.role === 'assistant' && (
                      <div className="msg__activity" role="status" aria-live="polite">
                        <span className="msg__activity-dot" aria-hidden="true" />
                        <span>
                          {(() => {
                            const running = (m.toolCalls ?? []).filter((c) => c.status === 'running');
                            const last = (m.toolCalls ?? [])[(m.toolCalls ?? []).length - 1];
                            if (running.length || last?.status === 'running') return `AI กำลังใช้เครื่องมือ: ${last?.name ?? ''}…`;
                            return 'AI กำลังคิดและเรียบเรียงคำตอบ…';
                          })()}
                        </span>
                        <span className="msg__activity-timer">{elapsed}s</span>
                      </div>
                    )}
                    <div className="msg__bubble">
                      {m.content ? (
                        <div className="md">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {displayContent(m.content)}
                          </ReactMarkdown>
                        </div>
                      ) : (m.toolCalls && m.toolCalls.length > 0 ? '' : (lastIsTyping && i === messages.length - 1 ? (
                        <span className="msg__typing" aria-label="กำลังพิมพ์"><i /><i /><i /></span>
                      ) : ''))}
                      {m.a2uiMessages && <A2uiCard messages={m.a2uiMessages} onAction={onAction} />}
                    </div>
                    {/* Completed answer actions: copy / feedback / tokens.
                        (share + read-aloud intentionally deferred until asked.) */}
                    {m.role === 'assistant' && m.content && !(busy && i === messages.length - 1) && (
                      <div className="msg__actions">
                        <button
                          className="msg__action"
                          aria-label="คัดลอกคำตอบ"
                          title="คัดลอกคำตอบ"
                          onClick={async () => {
                            const textToCopy = displayContent(m.content);
                            let ok = false;
                            try { await navigator.clipboard.writeText(textToCopy); ok = true; }
                            catch { /* fall through to legacy path */ }
                            if (!ok) {
                              // Legacy fallback (works without clipboard permissions)
                              const ta = document.createElement('textarea');
                              ta.value = textToCopy; ta.style.position = 'fixed'; ta.style.opacity = '0';
                              document.body.appendChild(ta); ta.select();
                              try { ok = document.execCommand('copy'); } catch { ok = false; }
                              ta.remove();
                            }
                            setActionAck(ok ? 'คัดลอกคำตอบแล้ว' : 'คัดลอกไม่สำเร็จ');
                            setTimeout(() => setActionAck(null), 1800);
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </button>
                        <button
                          className={`msg__action${m.feedback === 'like' ? ' msg__action--on' : ''}`}
                          aria-label="คำตอบดี"
                          title="คำตอบดี"
                          onClick={() => setMessages((prev) => { const n = [...prev]; if (n[i]) n[i] = { ...n[i]!, feedback: n[i]!.feedback === 'like' ? null : 'like' }; return n; })}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill={m.feedback === 'like' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>
                        </button>
                        <button
                          className={`msg__action${m.feedback === 'dislike' ? ' msg__action--on' : ''}`}
                          aria-label="คำตอบไม่ดี"
                          title="คำตอบไม่ดี"
                          onClick={() => setMessages((prev) => { const n = [...prev]; if (n[i]) n[i] = { ...n[i]!, feedback: n[i]!.feedback === 'dislike' ? null : 'dislike' }; return n; })}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill={m.feedback === 'dislike' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/></svg>
                        </button>
                        {(() => {
                          const u = m.usage;
                          const total = u?.totalTokens ?? (((u?.input ?? 0) + (u?.output ?? 0)) || null);
                          return total
                            ? <span className="msg__tokens" title={`input ${u?.input ?? 0} · output ${u?.output ?? 0}${m.usageEstimated ? ' (ประมาณ)' : ''}`}>{m.usageEstimated ? '≈' : '⌘'} {total.toLocaleString('en')} tokens</span>
                            : null;
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {view === 'chat' && (
        <div className="composer-wrap">
          {pendingAttachments.length > 0 && (
            <div className="attach-chips" role="list" aria-label="ไฟล์แนบ">
              {pendingAttachments.map((a) => (
                <span className="chip chip--attach" key={a.id} role="listitem">
                  {a.kind === 'image' ? '🖼' : a.kind === 'text' ? '📄' : '📦'} {a.name}
                  <button
                    className="chip__x"
                    aria-label={`เอา ${a.name} ออก`}
                    onClick={() => setPendingAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                  >✕</button>
                </span>
              ))}
            </div>
          )}
          <div className="composer">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={async (e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = '';
                if (!files.length) return;
                try {
                  const res = await fetch('/api/uploads', {
                    method: 'POST', headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ files: await Promise.all(files.map(async (f) => ({ name: f.name, content_b64: await readAsBase64(f) }))) }),
                  });
                  if (!res.ok) throw new Error(`upload ${res.status}`);
                  const { attachments: uploaded } = await res.json();
                  setPendingAttachments((prev) => [...prev, ...(uploaded ?? [])]);
                } catch (err) { console.error(err); }
              }}
            />
            <button
              className="btn btn--icon composer__attach"
              onClick={async () => {
                // Desktop app: native picker (also reaches macOS Photos via
                // the open panel's Media section). Browser dev: file input.
                if ((window as any).sagentDesktop?.pickFiles) {
                  try {
                    const picked = await pickAndUpload();
                    setPendingAttachments((prev) => [...prev, ...picked]);
                  } catch (err) { console.error(err); }
                } else { fileInputRef.current?.click(); }
              }}
              disabled={busy}
              aria-label="แนบไฟล์"
              title="แนบไฟล์ (macOS: เลือกจาก Photos ได้ผ่านส่วน Media)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            </button>
            <input
              className="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder="พิมพ์ข้อความถึงผู้ช่วย…"
              disabled={busy}
              aria-label="ข้อความถึงผู้ช่วย"
            />
            <button className="btn btn--send" onClick={() => send()} disabled={busy || (!input.trim() && !pendingAttachments.length)} aria-label="ส่งข้อความ">
              <Icon.Send />
            </button>
          </div>
        </div>
        )}
      </div>

      {actionAck && (
        <div className="toast" role="status">
          <Icon.Check /> {actionAck}
        </div>
      )}
    </div>
  );
}
