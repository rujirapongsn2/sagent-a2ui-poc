// Standalone dev entry: `npx tsx src/standalone.ts`.
// Optional env: SAGENT_PROVIDER=openai_compat GLM_API_KEY=... GLM_BASE_URL=... (live)
//               SAGENT_ENABLE_FS_TOOLS=1 (desktop tools outside Electron)
import path from 'node:path';
import { startServer } from './index.js';

const HERE = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(new URL(import.meta.url).pathname);

startServer({
  settingsPath: path.resolve(HERE, '../../.runtime/settings.json'),
  historyPath: path.resolve(HERE, '../../.runtime/conversations'),
  skillsPath: path.resolve(HERE, '../../.runtime/skills'),
});
