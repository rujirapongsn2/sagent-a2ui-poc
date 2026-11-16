// Settings persistence for the sagent desktop app.
// File: JSON next to the app (dev) or in Electron userData (packaged).
// api_key: stored via an injected secure store (Electron safeStorage) when
// available; plaintext in standalone dev with an explicit warning flag.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface SecureStore {
  encrypt(plain: string): string;
  decrypt(cipher: string): string;
}

export interface AgentSettings {
  provider: 'mock' | 'openai_compat' | 'ollama';
  base_url?: string;
  model?: string;
}

export interface SettingsFile {
  provider: 'mock' | 'openai_compat' | 'ollama';
  base_url?: string;
  model?: string;
  /** base64 ciphertext when secureStore was used */
  api_key_cipher?: string;
  /** plaintext fallback (standalone dev only) */
  api_key_plain?: string;
}

const DEFAULTS: SettingsFile = { provider: 'mock' };

export class SettingsStore {
  private file: string;
  private secure?: SecureStore;

  constructor(filePath: string, secure?: SecureStore) {
    this.file = filePath;
    this.secure = secure;
  }

  load(): SettingsFile {
    try {
      if (!existsSync(this.file)) return { ...DEFAULTS };
      return { ...DEFAULTS, ...JSON.parse(readFileSync(this.file, 'utf8')) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  save(input: {
    provider: 'mock' | 'openai_compat' | 'ollama';
    base_url?: string;
    model?: string;
    api_key?: string; // undefined = keep existing; '' = clear
  }): SettingsFile {
    const current = this.load();
    const next: SettingsFile = {
      provider: input.provider,
      base_url: input.base_url?.trim() || undefined,
      model: input.model?.trim() || undefined,
    };
    if (input.api_key === undefined) {
      // keep existing secret material
      if (current.api_key_cipher) next.api_key_cipher = current.api_key_cipher;
      if (current.api_key_plain) next.api_key_plain = current.api_key_plain;
    } else if (input.api_key.trim() === '') {
      // cleared
    } else if (this.secure) {
      next.api_key_cipher = this.secure.encrypt(input.api_key.trim());
    } else {
      next.api_key_plain = input.api_key.trim();
    }
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(next, null, 2));
    return next;
  }

  /** Runtime config for the engine: resolves the stored key via the secure store. */
  llmConfig(): AgentSettings & { api_key: string | null; plain_key_warning: boolean } {
    const s = this.load();
    let api_key: string | null = null;
    if (s.api_key_cipher && this.secure) {
      try { api_key = this.secure.decrypt(s.api_key_cipher); } catch { api_key = null; }
    } else if (s.api_key_plain) {
      api_key = s.api_key_plain;
    }
    return {
      provider: s.provider,
      base_url: s.base_url,
      model: s.model,
      api_key,
      plain_key_warning: Boolean(s.api_key_plain),
    };
  }

  /** Safe view for the client: never the key itself. */
  view() {
    const s = this.load();
    return {
      provider: s.provider,
      base_url: s.base_url ?? '',
      model: s.model ?? '',
      has_api_key: Boolean(s.api_key_cipher || s.api_key_plain),
      key_stored_securely: Boolean(s.api_key_cipher),
    };
  }
}
