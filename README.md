# sagent-a2ui-poc — Phase 0 + Phase 1

Desktop AI assistant: **sagent-engine (Rust, JSONL subprocess) × A2UI v1.0** + Electron shell
สำหรับ macOS (arm64/x64) และ Windows 11 Pro — design system: premium minimal AI SaaS
(lavender/indigo, tokens ใน `app/src/tokens.css`)

## Gate ผลลัพธ์ (ผ่านครบ 4/4)

| Gate | หลักฐาน |
|---|---|
| adapter ↔ engine (JSONL บน stdin/stdout) | spawn + payload + streaming events + tool round-trip (`demo` tool) + done |
| streaming text เข้า chat UI | SSE `delta` → bubble พิมพ์ทีละส่วน |
| การ์ด A2UI v1.0 render จริง | `createSurface/updateComponents/updateDataModel` + `@path` bindings ผ่าน validation ของ schema ทางการ |
| action round-trip | ปุ่มบนการ์ด → `MessageProcessor` actionHandler → `POST /api/action` → adapter ได้รับ (ack แสดงใน header) |

โหมด **live (GLM ผ่าน openai_compat)** ผ่านด้วย: LLM ตอบพร้อมบล็อก ` ```a2ui ` และ adapter สกัดเป็น SSE `a2ui` event → render การ์ดได้จริง ข้อมูลตามคำขอ

## โครงสร้าง

```
engine/sagent-engine   # binary Rust (build จาก rujirapongsn2/sagent)
server/                # adapter TS (node:http + SSE) — คุย engine ตรง ๆ ไม่ผ่าน Python SDK
app/                   # Vite + React chat shell + A2uiCard (@a2ui/react)
```

## รัน

```bash
# mock mode (ไม่เบิร์น token — adapter แนบการ์ดทดสอบเอง)
cd server && npm install && npx tsx src/index.ts      # → http://127.0.0.1:8790 (เสิร์ฟ app/dist ด้วย)

# live mode (GLM)
set -a; source ~/.hermes/.env; set +a
SAGENT_PROVIDER=openai_compat npx tsx src/index.ts

# build frontend
cd ../app && npm install && npm run build
```

## สิ่งที่เรียนรู้ (สำคัญสำหรับเฟสถัดไป)

1. **catalogId ต้องเป็น URI เต็ม** `https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json` (ไม่ใช่ "basic")
2. **Button.child = id ของ Text component** ที่ประกาศแยก (ไม่ใช่ string label); action ใช้ `action.event {name, context}`
3. **Text.variant enum มีแค่ `caption | body`** — validation error จาก zod บอกละเอียด อ่านจาก UI ได้เลย
4. `processMessages` รัน synchronous — **sync snapshot surfacesMap หลังเรียก** (events ยิงก่อน subscribe)
5. actionHandler ผูกตอน `new MessageProcessor(catalogs, handler)` — คลิกปุ่ม (`.click()`) แล้ว action มาถึง handler แน่นอน
6. history ของ sagent ต้องเป็น user/assistant สลับเริ่มด้วย user เป๊ะ — adapter sanitize ให้
7. delta ของ engine มีรูป `{delta:{delta:"…",type:"text"}}`

## ขั้นตอนถัดไป (เฟส 1)

- ย้ายเข้า Electron + sidecar management + auto-restart
- Settings UI (provider/key → OS keychain, Ollama offline)
- electron-builder: dmg (arm64+x64) + nsis; CI build matrix ทั้ง 2 OS ตั้งแต่เฟสนี้

## เฟส 1 — เสร็จแล้ว (16 พ.ย. 2026)

- **Electron shell** `desktop/` — main process รัน adapter server in-process (loopback
  127.0.0.1:พอร์ตสุ่ม, sandbox renderer, single-instance lock, external links เปิด system browser)
  engine เป็น sidecar subprocess ต่อ run เหมือนเดิม
- **Self-host fonts** — Inter + Noto Sans Thai (10 ไฟล์ woff2, 285KB) ใน `app/public/fonts`
  ผ่าน `app/src/fonts.css` — ออฟไลน์เต็มรูปแบบ ไม่มี CDN
- **A2UI theme** — `.a2ui-card` ตั้ง `--a2ui-*` custom properties ทั้งชุดจาก design tokens
  (primary/colors/border/radius/typography/shadow) ทำให้การ์ดที่ agent สร้างเข้าธีมแอปโดยไม่ต้อง fork renderer
- **Installer** — `desktop/release/sagent-0.1.0-arm64.dmg` + `x64` (icon gradient orb เป็น icns แล้ว;
  unsigned → Gatekeeper ถามครั้งแรก) ทดสอบจาก dmg จริง: app 200, font 200, chat SSE ครบ
- **CI** — `.github/workflows/desktop-release.yml` build matrix macOS(arm64/x64) + Windows(x64):
  clone sagent → cargo build → vite build → electron-builder → artifacts (+ auto-release เมื่อ push tag `v*`)

### คำสั่งหลัก

```bash
cd app && npm ci && npm run build          # frontend
cd ../desktop && npm ci
npm start                                  # รัน Electron (dev)
npm run dist:mac                           # dmg (arm64+x64); dist:win ใน CI
```

### บทเรียนสำคัญเฟส 1

1. ใน CJS bundle (esbuild) `import.meta.url` เป็น undefined — resolve path ต้อง guard `__dirname`
2. **env race จาก import hoisting**: ตั้ง `process.env` ที่ main.ts ไม่รับประกัน module ที่ bundle มาอ่านทัน —
   embedding host ต้องส่ง paths ผ่าน args ของ `startServer()` ตรง ๆ
3. Server ต้องเป็น library module (export `startServer`) + standalone entry แยกไฟล์ ไม่งั้น listen ซ้อน
