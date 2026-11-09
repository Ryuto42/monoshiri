// Redraws every app icon, launch icon and splash image from web/assets/mark.svg (the Monoshiri mark),
// and the files in brand/ for use outside the app (account avatars, documents).
// Usage: node infra/app-icons.mjs  (macOS; drives headless Google Chrome to rasterize, no extra packages)
// Each PNG keeps its current size and layout: full-bleed squares, rounded tiles, Android's legacy/round/foreground
// layers, and splash images where the orange tile is found in the old image and redrawn in the same place.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const web = path.join(root, 'web');
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORANGE = '#ef6a3a';
// The mark's bounding box takes 58% of the tile, the same margin as a Material Symbol in the comparison Aya chose.
// mark.svg's box is 20/24 of its viewBox, so the SVG itself is drawn at 0.58 / (20/24) of the tile.
const MARK = 0.58 / (20 / 24);

const res = path.join(web, 'android/app/src/main/res');
const ios = path.join(web, 'ios/App/App/Assets.xcassets');
const tasks = [
  ['public/icon-192.png', 'rounded'],
  ['public/icon-512.png', 'rounded'],
  ['assets/icon-only.png', 'full'],
  ['assets/icon-foreground.png', 'fg'],
  ['assets/splash.png', 'splash'],
  ['assets/splash-dark.png', 'splash'],
  ['ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 'full'],
  ['android/app/src/main/res/drawable-nodpi/splash_logo.png', 'rounded'],
];
for (const s of ['1x', '2x', '3x']) tasks.push([`ios/App/App/Assets.xcassets/LaunchIcon.imageset/LaunchIcon@${s}.png`, 'rounded']);
for (const f of await readdir(path.join(ios, 'Splash.imageset'))) if (f.endsWith('.png')) tasks.push([`ios/App/App/Assets.xcassets/Splash.imageset/${f}`, 'splash']);
for (const d of await readdir(res)) {
  if (d.startsWith('mipmap-') && !d.includes('anydpi')) {
    tasks.push([`android/app/src/main/res/${d}/ic_launcher.png`, 'square'], [`android/app/src/main/res/${d}/ic_launcher_round.png`, 'circle'], [`android/app/src/main/res/${d}/ic_launcher_foreground.png`, 'fg']);
  }
  if (d.startsWith('drawable')) for (const f of await readdir(path.join(res, d))) if (f === 'splash.png') tasks.push([`android/app/src/main/res/${d}/splash.png`, 'splash']);
}

// brand/: an orange square for account avatars (fits a circle crop too), and the bare mark in orange and white.
const brand = [['brand/icon-orange-1024.png', 'full', 1024], ['brand/icon-orange-512.png', 'full', 512], ['brand/mark-orange-1024.png', 'mark-orange', 1024], ['brand/mark-white-1024.png', 'mark-white', 1024]];

const mark = (await readFile(path.join(web, 'assets/mark.svg'), 'utf8')).replace(/<!--.*?-->\s*/s, '');
const markUrl = (color) => `data:image/svg+xml;base64,${Buffer.from(mark.replaceAll('currentColor', color)).toString('base64')}`;
const input = [
  ...(await Promise.all(tasks.map(async ([file, kind]) => ({ file: `web/${file}`, kind, src: `data:image/png;base64,${(await readFile(path.join(web, file))).toString('base64')}` })))),
  ...brand.map(([file, kind, size]) => ({ file, kind, size })),
];

const page = `<!doctype html><pre id="out"></pre><script>
const T=${JSON.stringify(input)}, ORANGE='${ORANGE}', MARK=${MARK}, WHITE='${markUrl('#fff')}', OMARK='${markUrl(ORANGE)}';
const load=(s)=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=s});
// The orange tile in an old image: its bounding box and the background colour around it.
function findTile(g,w,h){const p=g.getImageData(0,0,w,h).data;let x0=w,y0=h,x1=-1,y1=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(p[i+3]>200&&p[i]>200&&p[i+1]>80&&p[i+1]<150&&p[i+2]<110){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}}
  return{x:x0,y:y0,s:Math.max(x1-x0+1,y1-y0+1),bg:'rgba('+[p[0],p[1],p[2],p[3]/255]+')'}}
function tile(g,x,y,s,shape,mark){g.fillStyle=ORANGE;g.beginPath();
  if(shape==='circle')g.arc(x+s/2,y+s/2,s/2,0,7);else g.roundRect(x,y,s,s,s*(shape==='rounded'?0.225:shape==='square'?0.06:0));g.fill();
  const m=s*MARK;g.drawImage(mark,x+(s-m)/2,y+(s-m)/2,m,m)}
(async()=>{const mark=await load(WHITE),omark=await load(OMARK),out={};
  for(const t of T){const old=t.src?await load(t.src):null,w=old?old.width:t.size,h=old?old.height:t.size,c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.imageSmoothingQuality='high';
    if(t.kind==='full')tile(g,0,0,w,'full',mark);
    else if(t.kind==='mark-orange'||t.kind==='mark-white')g.drawImage(t.kind==='mark-orange'?omark:mark,0,0,w,h);
    else if(t.kind==='rounded')tile(g,0,0,w,'rounded',mark);
    else if(t.kind==='fg'){const m=w*MARK;g.drawImage(mark,(w-m)/2,(h-m)/2,m,m)}
    else{g.drawImage(old,0,0);const b=findTile(g,w,h);
      if(t.kind==='splash'){g.fillStyle=b.bg;g.fillRect(b.x-3,b.y-3,b.s+6,b.s+6);tile(g,b.x,b.y,b.s,'rounded',mark)}
      else{g.clearRect(0,0,w,h);tile(g,b.x,b.y,b.s,t.kind,mark)}}
    out[t.file]=c.toDataURL('image/png')}
  document.getElementById('out').textContent=JSON.stringify(out)})();
</script>`;

const dir = await mkdtemp(path.join(tmpdir(), 'monoshiri-icons-'));
await writeFile(path.join(dir, 'icons.html'), page);
const dom = execFileSync(chrome, ['--headless', '--disable-gpu', '--virtual-time-budget=60000', '--dump-dom', `file://${dir}/icons.html`], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
const json = dom.match(/<pre id="out">(.*?)<\/pre>/s)?.[1];
if (!json) throw new Error('Chrome did not finish drawing the icons');
const out = JSON.parse(json.replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
await mkdir(path.join(root, 'brand'), { recursive: true });
for (const [file, url] of Object.entries(out)) await writeFile(path.join(root, file), Buffer.from(url.split(',')[1], 'base64'));

// The browser tab icon is the same tile as an SVG.
const inner = mark.match(/<svg[^>]*>(.*)<\/svg>/s)[1].replaceAll('currentColor', '#fff');
const sw = mark.match(/stroke-width="([^"]+)"/)[1];
const o = (24 * (1 - MARK)) / 2;
await writeFile(path.join(web, 'public/favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5.4" fill="${ORANGE}"/><g transform="translate(${o.toFixed(3)} ${o.toFixed(3)}) scale(${MARK.toFixed(4)})" fill="none" stroke="#fff" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${inner}</g></svg>\n`);
await writeFile(path.join(root, 'brand/icon-orange.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="${ORANGE}"/><g transform="translate(${o.toFixed(3)} ${o.toFixed(3)}) scale(${MARK.toFixed(4)})" fill="none" stroke="#fff" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${inner}</g></svg>\n`);
for (const [name, color] of [['mark-orange', ORANGE], ['mark-white', '#fff']]) await writeFile(path.join(root, `brand/${name}.svg`), mark.replaceAll('currentColor', color));
await writeFile(path.join(ios, 'BrandMark.imageset/mark.svg'), mark);
console.log(`drew ${Object.keys(out).length} PNGs, favicon.svg and the brand/ files`);
