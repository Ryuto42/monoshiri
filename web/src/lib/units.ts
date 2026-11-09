import { useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { getCard, saveCard } from './cards';
import type { Stage } from './level';
import { stripRuby } from './ruby';
import type { Card, CurriculumUnit, UnitLink } from './types';
import curriculum from '../data/curriculum.json';

// School years as one scale: 小1–6 → 1–6, 中1–3 → 7–9, 高1–3 → 10–12.
const KANJI_NUM: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
function yearSpan(grade: string): [number, number] {
  const base = /高/.test(grade) ? 9 : /中/.test(grade) ? 6 : 0;
  const nums = [...grade.normalize('NFKC').matchAll(/[1-6一二三四五六]/g)].map((m) => KANJI_NUM[m[0]] ?? Number(m[0]));
  if (!nums.length) return base === 0 ? [1, 6] : [base + 1, base + 3];
  return [base + Math.min(...nums), base + Math.max(...nums)];
}

export const STAGE_YEARS: Record<Stage, [number, number]> = { lower: [1, 3], upper: [4, 6], junior: [7, 9], senior: [10, 12] };
export const BAND_LABEL: Record<Stage, string> = { lower: '小学校 1〜3年', upper: '小学校 4〜6年', junior: '中学校', senior: '高校' };

const SUBJECT_ORDER = ['生活', '理科', '物理基礎', '化学基礎', '生物基礎', '地学基礎', '物理', '化学', '生物', '地学', '社会', '地理歴史', '地理', '歴史', '公民', '家庭', '技術・家庭', '家庭基礎', '技術', '算数', '数学', '保健', '体育', '保健体育', '図画工作', '美術', '音楽', '国語', '外国語', '英語', '情報', '総合'];
const subjectRank = (s: string) => {
  const i = SUBJECT_ORDER.indexOf(s);
  return i < 0 ? SUBJECT_ORDER.length : i;
};

export type Unit = CurriculumUnit & { from: number; to: number; band: Stage };

function bandOf(from: number): Stage {
  return from <= 3 ? 'lower' : from <= 6 ? 'upper' : from <= 9 ? 'junior' : 'senior';
}

export const UNITS: Unit[] = (curriculum as CurriculumUnit[])
  .map((u) => {
    const [from, to] = yearSpan(u.grade);
    return { ...u, from, to, band: bandOf(from) };
  })
  .sort((a, b) => a.from - b.from || a.to - b.to || subjectRank(a.subject) - subjectRank(b.subject) || a.subject.localeCompare(b.subject, 'ja'));

export const unitById = new Map(UNITS.map((u) => [u.id, u]));

export type Group = { key: string; grade: string; subject: string; band: Stage; units: Unit[] };

// Units grouped by grade × subject, in school order (the given stage's band first).
export function unitGroups(stage: Stage | null): Group[] {
  const map = new Map<string, Group>();
  for (const u of UNITS) {
    const key = `${u.grade}|${u.subject}`;
    const g = map.get(key) ?? { key, grade: u.grade, subject: u.subject, band: u.band, units: [] };
    g.units.push(u);
    map.set(key, g);
  }
  const groups = [...map.values()];
  return stage ? [...groups.filter((g) => g.band === stage), ...groups.filter((g) => g.band !== stage)] : groups;
}

export const SUBJECTS = [...new Set(UNITS.map((u) => u.subject))].sort((a, b) => subjectRank(a) - subjectRank(b));

/** Where a unit sits for someone at this stage: already learned, being learned now, next up, or later. */
export type UnitStatus = 'done' | 'now' | 'soon' | 'later';
export function unitStatus(u: Pick<Unit, 'from' | 'to'>, stage: Stage | null): UnitStatus | null {
  if (!stage) return null;
  const [lo, hi] = STAGE_YEARS[stage];
  if (u.to < lo) return 'done';
  if (u.from > hi) return u.from === hi + 1 ? 'soon' : 'later';
  return 'now';
}
export const STATUS_LABEL: Record<UnitStatus, string> = { done: 'もう習ったね', now: 'いま習うよ', soon: 'もうすぐ習う', later: 'これから習う' };

export const SUBJECT_STYLE: Record<string, { bg: string; ink: string; icon: string }> = {
  理科: { bg: '#D9EFE6', ink: '#23684F', icon: 'science' },
  生活: { bg: '#FBEBC2', ink: '#8A6206', icon: 'eco' },
  社会: { bg: '#DCE8F7', ink: '#2A5C93', icon: 'public' },
  地理: { bg: '#DCE8F7', ink: '#2A5C93', icon: 'public' },
  歴史: { bg: '#E8DCCB', ink: '#5E4527', icon: 'history_edu' },
  地理歴史: { bg: '#E8DCCB', ink: '#5E4527', icon: 'history_edu' },
  公民: { bg: '#DCE8F7', ink: '#2A5C93', icon: 'public' },
  家庭: { bg: '#FDE3D6', ink: '#B4441B', icon: 'home' },
  家庭基礎: { bg: '#FDE3D6', ink: '#B4441B', icon: 'home' },
  '技術・家庭': { bg: '#FDE3D6', ink: '#B4441B', icon: 'construction' },
  技術: { bg: '#F6D3D0', ink: '#8C2D25', icon: 'construction' },
  算数: { bg: '#EADFF5', ink: '#5B3F8C', icon: 'lightbulb' },
  数学: { bg: '#EADFF5', ink: '#5B3F8C', icon: 'lightbulb' },
  保健: { bg: '#F8DCE5', ink: '#9A2F57', icon: 'health_and_safety' },
  体育: { bg: '#F8DCE5', ink: '#9A2F57', icon: 'sports_soccer' },
  保健体育: { bg: '#F8DCE5', ink: '#9A2F57', icon: 'health_and_safety' },
  図画工作: { bg: '#FCE2C0', ink: '#87470A', icon: 'palette' },
  図工: { bg: '#FCE2C0', ink: '#87470A', icon: 'palette' },
  美術: { bg: '#FCE2C0', ink: '#87470A', icon: 'palette' },
  音楽: { bg: '#E6E1F0', ink: '#4F4466', icon: 'music_note' },
  情報: { bg: '#D9D6F2', ink: '#423A8C', icon: 'computer' },
  物理: { bg: '#CFE0F4', ink: '#1F4F82', icon: 'bolt' },
  物理基礎: { bg: '#CFE0F4', ink: '#1F4F82', icon: 'bolt' },
  化学: { bg: '#D9EFE6', ink: '#23684F', icon: 'science' },
  化学基礎: { bg: '#D9EFE6', ink: '#23684F', icon: 'science' },
  生物: { bg: '#D6EBC0', ink: '#3F6A14', icon: 'biotech' },
  生物基礎: { bg: '#D6EBC0', ink: '#3F6A14', icon: 'biotech' },
  地学: { bg: '#E8DCCB', ink: '#5E4527', icon: 'public' },
  地学基礎: { bg: '#E8DCCB', ink: '#5E4527', icon: 'public' },
};
export const subjectStyle = (s: string) => SUBJECT_STYLE[s] ?? { bg: '#E3E0D8', ink: '#4A463D', icon: 'school' };

/** Cards per unit id. */
export function cardsByUnit(cards: Card[]) {
  const map = new Map<string, Card[]>();
  for (const c of cards) for (const id of c.units ?? []) if (unitById.has(id)) map.set(id, [...(map.get(id) ?? []), c]);
  return map;
}

// --- Units for a thing (POST /api/units), cached in memory and on the device. The server answer is the same for every stage.

const CACHE_KEY = 'monoshiri.units.v1';
const CACHE_MAX = 300;
const CACHE_TTL = 30 * 24 * 3600_000;
type Stored = Record<string, { t: number; u: UnitLink[] }>;

function readCache(): Stored {
  try {
    const s = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
    return s && typeof s === 'object' ? s : {};
  } catch {
    return {};
  }
}
function writeCache(key: string, u: UnitLink[]) {
  try {
    const s = readCache();
    s[key] = { t: Date.now(), u };
    const keys = Object.keys(s).sort((a, b) => s[b].t - s[a].t);
    for (const k of keys.slice(CACHE_MAX)) delete s[k];
    localStorage.setItem(CACHE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: the memory cache still covers this session */
  }
}

const clean = (list: unknown): UnitLink[] =>
  (Array.isArray(list) ? list : [])
    .filter((l): l is UnitLink => !!l && typeof l.id === 'string' && unitById.has(l.id))
    .filter((l, i, a) => a.findIndex((x) => x.id === l.id) === i)
    .slice(0, 5)
    .map((l) => ({ id: l.id, why: typeof l.why === 'string' ? l.why.slice(0, 40) : '' }));

const mem = new Map<string, Promise<UnitLink[]>>();

export function unitsFor(name: string): Promise<UnitLink[]> {
  const key = stripRuby(name).trim();
  const running = mem.get(key);
  if (running) return running;
  const hit = readCache()[key];
  const p =
    hit && Date.now() - hit.t < CACHE_TTL
      ? Promise.resolve(clean(hit.u))
      : api.units(key).then((r) => {
          const u = clean(r.units);
          writeCache(key, u);
          return u;
        });
  mem.set(key, p);
  // A failure is remembered for a minute so screens that re-render don't hammer the API.
  p.catch(() => setTimeout(() => mem.get(key) === p && mem.delete(key), 60_000));
  return p;
}

/** Loading, empty results and failures stay distinct, with an explicit retry. */
export function useUnitLookup(name: string | null | undefined) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ name: string; attempt: number; links: UnitLink[] | null; error: boolean } | null>(null);
  useEffect(() => {
    if (!name || !UNITS.length) return;
    let live = true;
    unitsFor(name).then(
      (links) => live && setState({ name, attempt, links, error: false }),
      () => live && setState({ name, attempt, links: null, error: true }),
    );
    return () => { live = false; };
  }, [name, attempt]);
  return {
    links: state && state.name === name && state.attempt === attempt ? state.links : null,
    error: !!state && state.name === name && state.attempt === attempt && state.error,
    retry: () => { if (name) mem.delete(stripRuby(name).trim()); setAttempt((n) => n + 1); },
  };
}

export function useUnitLinks(name: string | null | undefined) {
  return useUnitLookup(name).links;
}

// Cards saved before units existed get them the first time the zukan (or the card) is opened. Best effort, one at a time.
let filling = false;
const tried = new Set<string>();
export async function backfillUnits(cards: Card[]) {
  if (filling || !UNITS.length) return;
  filling = true;
  try {
    for (const c of cards) {
      if (c.units || tried.has(c.id)) continue;
      tried.add(c.id);
      try {
        await fillCard(c.id, c.name);
      } catch (e) {
        if (e instanceof ApiError && ['budget', 'user_limit', 'rate_limited', 'busy', 'attest_required'].includes(e.code)) break;
      }
    }
  } finally {
    filling = false;
  }
}

export async function fillCard(id: string, name: string) {
  const links = await unitsFor(name);
  const latest = getCard(id);
  if (!latest || latest.units) return;
  await saveCard({ ...latest, units: links.map((l) => l.id), updatedAt: Date.now() });
}

/** The unit closest to this person's school years (for a single badge): one they learn now, then the nearest. */
export function nearestUnit(ids: string[] | undefined, stage: Stage | null): Unit | null {
  const list = (ids ?? []).map((id) => unitById.get(id)).filter((u): u is Unit => !!u);
  if (!list.length) return null;
  const [lo, hi] = stage ? STAGE_YEARS[stage] : [4, 9];
  const gap = (u: Unit) => (u.to < lo ? lo - u.to : u.from > hi ? u.from - hi : 0);
  return [...list].sort((a, b) => gap(a) - gap(b))[0];
}
