// Rebuilds web/src/assets/fonts/material-symbols-rounded.woff2 with exactly the icons the app uses.
// Usage: node infra/icons.mjs  (collects names from web/src and server/src/ai.ts, keeps only real Material Symbols names)
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const CODEPOINTS =
  'https://raw.githubusercontent.com/google/material-design-icons/master/variablefont/MaterialSymbolsRounded%5BFILL%2CGRAD%2Copsz%2Cwght%5D.codepoints';

async function files(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await files(p)));
    else if (/\.(tsx?|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

const sources = [...(await files(path.join(root, 'web/src'))), path.join(root, 'server/src/ai.ts')];
const candidates = new Set();
for (const f of sources) {
  const text = await readFile(f, 'utf8');
  for (const m of text.matchAll(/['"`>]([a-z][a-z0-9_]{1,40})['"`<]/g)) candidates.add(m[1]);
}

const known = new Set((await (await fetch(CODEPOINTS)).text()).split('\n').map((l) => l.split(' ')[0]).filter(Boolean));
const names = [...candidates].filter((n) => known.has(n) && n.length > 2).sort();
console.log(`${names.length} icons:`, names.join(' '));

const css = await (
  await fetch(
    `https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,0&icon_names=${names.join(',')}&display=block`,
    { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' } },
  )
).text();
const url = /url\((https:[^)]+)\)/.exec(css)?.[1];
if (!url) throw new Error(`no font url in response:\n${css.slice(0, 400)}`);
const font = Buffer.from(await (await fetch(url)).arrayBuffer());
await writeFile(path.join(root, 'web/src/assets/fonts/material-symbols-rounded.woff2'), font);
console.log(`wrote ${font.length} bytes`);
