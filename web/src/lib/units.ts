import { useEffect, useState, useSyncExternalStore } from 'react';
import { api, ApiError } from './api';
import { getCard, saveCard, useCards } from './cards';
import { useMe } from './firebase';
import { useStage, type Stage } from './level';
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

export const unitLabel = (u: CurriculumUnit) => `${u.grade} ${u.subject}『${u.unit}』`;

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

/** Units for a thing: null while loading (or when the lookup failed). */
export function useUnitLinks(name: string | null | undefined) {
  const [state, setState] = useState<{ name: string; links: UnitLink[] } | null>(null);
  useEffect(() => {
    if (!name || !UNITS.length) return;
    let live = true;
    unitsFor(name).then(
      (links) => live && setState({ name, links }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [name]);
  return state && state.name === name ? state.links : null;
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

// --- Daily mission: one unit (of this person's school years) that has no card yet, picked from the date and uid.

export type Mission = { day: string; unit: Unit; done: boolean };
type MissionRecord = { day: string; id: string; stage?: string; started?: boolean; done?: boolean };

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const missionKey = (uid: string) => `monoshiri.mission.${uid}`;

function readMission(uid: string): MissionRecord | null {
  try {
    const r = JSON.parse(localStorage.getItem(missionKey(uid)) ?? 'null');
    return r && typeof r.day === 'string' && typeof r.id === 'string' ? r : null;
  } catch {
    return null;
  }
}
function writeMission(uid: string, r: MissionRecord) {
  try {
    localStorage.setItem(missionKey(uid), JSON.stringify(r));
  } catch {
    /* without storage the mission is still the same all day: it is picked from the date */
  }
}

function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

function pick(uid: string, day: string, stage: Stage | null, cards: Card[]): Unit | null {
  const have = cardsByUnit(cards);
  // Without a stage the explanations are written for 小4〜中3, so the mission is too.
  const [lo, hi] = stage ? STAGE_YEARS[stage] : [4, 9];
  const open = UNITS.filter((u) => !have.has(u.id) && u.examples.length > 0);
  const fit = open.filter((u) => u.to >= lo && u.from <= hi);
  const list = fit.length ? fit : open;
  return list.length ? list[hash(`${day}:${uid}`) % list.length] : null;
}

let mission: (Mission & { uid: string }) | null = null;
const missionListeners = new Set<() => void>();
const emitMission = () => missionListeners.forEach((l) => l());

function ensureMission(uid: string, stage: Stage | null, cards: Card[]) {
  const day = today();
  let rec = readMission(uid);
  // A mission nobody has seen yet is picked again if it turns out to be collected already (cards were still loading).
  if (rec && rec.day === day && (!unitById.has(rec.id) || (!rec.started && !rec.done && cardsByUnit(cards).has(rec.id)))) rec = null;
  // Choosing (or changing) the school year picks a mission from the new years, unless today's is already done.
  if (rec && rec.day === day && !rec.done && (rec.stage ?? 'none') !== (stage ?? 'none')) rec = null;
  if (!rec || rec.day !== day) {
    const u = pick(uid, day, stage, cards);
    if (!u) {
      if (mission) {
        mission = null;
        emitMission();
      }
      return;
    }
    rec = { day, id: u.id, stage: stage ?? 'none' };
    writeMission(uid, rec);
  }
  const unit = unitById.get(rec.id)!;
  const done = !!rec.done;
  if (mission?.uid === uid && mission.day === day && mission.unit.id === unit.id && mission.done === done) return;
  mission = { uid, day, unit, done };
  emitMission();
}

/** Marks today's mission done when one of these units is the mission's. Returns the mission when this call completed it. */
export function completeMission(ids: string[]): Mission | null {
  if (!mission || mission.done || !ids.includes(mission.unit.id)) return null;
  // Only a mission the person has seen can be completed; a surprise "done" for a mission they never saw would confuse.
  const rec = readMission(mission.uid);
  if (!rec?.started || rec.day !== mission.day) return null;
  writeMission(mission.uid, { ...rec, done: true });
  mission = { ...mission, done: true };
  emitMission();
  void api.events([{ name: 'mission_done' }]);
  return mission;
}

/** Called when the mission is put on screen; reported once a day. */
export function missionShown() {
  if (!mission) return;
  const rec = readMission(mission.uid);
  if (!rec || rec.day !== mission.day || rec.started) return;
  writeMission(mission.uid, { ...rec, started: true });
  void api.events([{ name: 'mission_start' }]);
}

export const getMission = (): Mission | null => mission;

// A unit the zukan should open on its next mount (e.g. tapping the mission on the camera screen).
let requested: string | null = null;
export const requestUnit = (id: string) => void (requested = id);
export const requestedUnit = () => (requested && unitById.has(requested) ? requested : null);
export const clearRequestedUnit = () => void (requested = null);

export function useMission(): Mission | null {
  const me = useMe();
  const st = useStage();
  const cards = useCards();
  const uid = me?.uid ?? null;
  const ready = st.loaded && st.uid === uid;
  const stage = st.stage;
  const m = useSyncExternalStore(
    (l) => {
      missionListeners.add(l);
      return () => missionListeners.delete(l);
    },
    () => mission,
  );
  useEffect(() => {
    if (uid && ready && UNITS.length) ensureMission(uid, stage, cards);
  }, [uid, stage, ready, cards]);
  return m && m.uid === uid ? m : null;
}

/** The unit closest to this person's school years (for a single badge): one they learn now, then the nearest. */
export function nearestUnit(ids: string[] | undefined, stage: Stage | null): Unit | null {
  const list = (ids ?? []).map((id) => unitById.get(id)).filter((u): u is Unit => !!u);
  if (!list.length) return null;
  const [lo, hi] = stage ? STAGE_YEARS[stage] : [4, 9];
  const gap = (u: Unit) => (u.to < lo ? lo - u.to : u.from > hi ? u.from - hi : 0);
  return [...list].sort((a, b) => gap(a) - gap(b))[0];
}
