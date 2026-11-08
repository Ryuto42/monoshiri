import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { DetectedObject, Explore } from '../lib/types';
import type { Flow } from '../lib/flow';
import { useCards } from '../lib/cards';
import { LoadingCard } from '../components/LoadingCard';
import { SearchEntry } from '../components/SearchEntry';
import { Button, Chip, Icon, IconButton } from '../components/ui';
import { catStyle, spring, TOPIC_COLORS } from '../components/theme';
import { Speak } from '../components/Speak';
import { haptic, openExternal } from '../lib/native';
import { RubyText } from '../components/RubyText';
import { stripRuby } from '../lib/ruby';
import { UnitChips } from '../components/UnitChips';
import { api } from '../lib/api';
import { useStage } from '../lib/level';
import { toast } from '../lib/toast';
import { completeMission, unitById, unitLabel, unitStatus, useMission, useUnitLinks, type Mission } from '../lib/units';

const list = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } };
const item = { hidden: { opacity: 0, y: 18, scale: 0.97 }, show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 30 } } } as const;

export function ExploreContent({ flow, crops, onPick, onAsk, onCorrect, onTopic, onMakeCard, onRetry, onReset }: {
  flow: Flow; crops: string[]; onPick: (i: number) => void; onAsk: (label: string) => void; onCorrect: (label: string) => void;
  onTopic: (id: string) => void; onMakeCard: () => void; onRetry: () => void; onReset: () => void;
}) {
  if (flow.stage === 'error') return <ErrorState message={flow.error} onRetry={onRetry} onReset={onReset} />;
  if (flow.stage === 'exploring') return <Exploring label={flow.label ?? flow.objects[flow.selected ?? 0]?.label ?? ''} crop={flow.crop} fresh={flow.known === false} />;
  if (flow.stage === 'explore' && flow.explore) {
    // Only a thing picked from a photo can be "misread"; a typed name is already what the person meant.
    const picked = flow.shot && flow.selected != null ? flow.objects[flow.selected] : null;
    return (
      <ExploreView
        ex={flow.explore}
        crop={flow.crop}
        onTopic={onTopic}
        onMakeCard={onMakeCard}
        onReset={onReset}
        notes={Object.keys(flow.notes).length}
        correction={picked ? { alts: picked.alts ?? [], onCorrect } : null}
      />
    );
  }
  if (flow.stage === 'detecting') return <Detecting />;
  return <Picker objects={flow.objects} crops={crops} onPick={onPick} onAsk={onAsk} onReset={onReset} />;
}

function Detecting() {
  return (
    <div className="px-6 pt-2 pb-8">
      <p className="text-[13px] font-bold text-ink-3">しらべ中</p>
      <h2 className="text-[24px] font-black">写真の中のモノを探しています</h2>
      <div className="mt-5 flex gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-24 w-24 rounded-3xl" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  );
}

function Picker({ objects, crops, onPick, onAsk, onReset }: {
  objects: DetectedObject[]; crops: string[]; onPick: (i: number) => void; onAsk: (label: string) => void; onReset: () => void;
}) {
  const [text, setText] = useState('');
  return (
    <div className="px-6 pt-1 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-bold text-accent">{objects.length ? `${objects.length}こ 見つけたよ` : 'うーん…'}</p>
          <h2 className="text-[24px] font-black leading-snug">{objects.length ? 'どれを調べる？' : 'モノが見つかりませんでした'}</h2>
        </div>
        <IconButton icon="photo_camera" label="撮りなおす" tone="paper" onClick={onReset} />
      </div>
      <motion.ul variants={list} initial="hidden" animate="show" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
        {objects.map((o, i) => (
          <motion.li key={`${o.label}-${i}`} variants={item}>
            <motion.button
              whileTap={{ scale: 0.95 }}
              whileHover={{ y: -3 }}
              transition={spring}
              onClick={() => onPick(i)}
              className="group w-full overflow-hidden rounded-3xl bg-paper-2 text-left shadow-[var(--shadow-card)]"
            >
              <div className="aspect-[4/3] overflow-hidden bg-paper-3">
                {crops[i] && <img src={crops[i]} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />}
              </div>
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <span className="font-black">{o.label}</span>
                <Icon name="arrow_forward" size={20} className="text-accent transition-transform group-hover:translate-x-0.5" />
              </div>
            </motion.button>
          </motion.li>
        ))}
      </motion.ul>
      <form
        className="mt-5 flex items-center gap-2 rounded-full bg-paper-2 p-1.5 pl-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onAsk(text.trim());
        }}
      >
        <Icon name="edit" size={20} className="text-ink-3" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="名前を入れて調べる（例: ペットボトル）"
          className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none placeholder:text-ink-3"
          maxLength={30}
        />
        <Button type="submit" icon="search" className="h-10 px-4" disabled={!text.trim()}>
          調べる
        </Button>
      </form>
    </div>
  );
}

function Exploring({ label, crop, fresh }: { label: string; crop: string | null; fresh: boolean }) {
  return (
    <div className="px-6 pt-1 pb-6">
      <LoadingCard img={crop} expected={14} steps={['写真をよく見ています', 'Google で調べています', '学べるテーマを集めています', 'カードにまとめています']}>
        <p className="text-[13px] font-bold text-accent">{fresh ? 'まだだれも調べていないモノかも！' : 'モノシリ中…'}</p>
        <h2 className="text-[26px] font-black leading-tight">{label}</h2>
        <p className="mt-1 text-[13px] text-ink-3">
          {fresh ? 'モノシリの図鑑にまだないモノです。Google 検索で確かめながら、新しいページを作っています' : 'Google 検索で確かめながら、学べるテーマを集めています'}
        </p>
      </LoadingCard>
    </div>
  );
}

function ExploreView({ ex, crop, onTopic, onMakeCard, onReset, notes, correction }: {
  ex: Explore; crop: string | null; onTopic: (id: string) => void; onMakeCard: () => void; onReset: () => void; notes: number;
  correction: { alts: string[]; onCorrect: (label: string) => void } | null;
}) {
  const [fixing, setFixing] = useState(false);
  const c = catStyle(ex.category);
  const cards = useCards();
  const saved = cards.some((x) => x.id === ex.id);
  const root = useRef<HTMLDivElement>(null);
  return (
    <motion.div ref={root} initial="hidden" animate="show" variants={list} className="pb-10">
      {ex.firstFind && <FirstFind name={ex.name} saved={saved} />}
      <motion.header variants={item} className="flex items-center gap-4 px-6 pt-1">
        <div className="relative shrink-0">
          {crop ? (
            <motion.img layoutId="crop" src={crop} alt="" className="h-20 w-20 rounded-[22px] object-cover shadow-[var(--shadow-card)]" />
          ) : (
            <div className="grid h-20 w-20 place-items-center rounded-[22px]" style={{ background: c.bg, color: c.ink }}>
              <Icon name={ex.icon} size={40} fill />
            </div>
          )}
          <span className="absolute -bottom-2 -right-2 grid h-9 w-9 place-items-center rounded-full border-[3px] border-paper" style={{ background: c.bg, color: c.ink }}>
            <Icon name={ex.icon} size={18} fill />
          </span>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip color={c} icon={c.icon}>{ex.category}</Chip>
          </div>
          <p className="mt-1 text-[12px] font-bold tracking-wider text-ink-3">{ex.reading}・{ex.en}</p>
          <h2 data-speak className="text-[28px] font-black leading-tight">{ex.name}</h2>
        </div>
      </motion.header>

      {correction && !fixing && (
        <motion.div variants={item} className="mx-6 mt-2">
          <Button tone="ghost" icon="edit" className="-ml-3 h-10 px-3 text-[14px] text-ink-2" aria-label={`ちがうよ（「${ex.name}」の名前をなおす）`} onClick={() => setFixing(true)}>
            ちがうよ
          </Button>
        </motion.div>
      )}
      <AnimatePresence initial={false}>
        {correction && fixing && (
          <Correction
            name={ex.name}
            alts={correction.alts.filter((a) => a !== ex.name)}
            onCancel={() => setFixing(false)}
            onPick={(label) => {
              setFixing(false);
              correction.onCorrect(label);
            }}
          />
        )}
      </AnimatePresence>

      <motion.p data-speak variants={item} className="mx-6 mt-4 text-[17px] font-bold leading-relaxed text-accent">
        <RubyText text={ex.oneLiner} />
      </motion.p>
      <motion.p data-speak variants={item} className="mx-6 mt-2 text-ink-2">
        <RubyText text={ex.summary} />
      </motion.p>

      <motion.div variants={item} className="mx-6 mt-4 flex gap-3 rounded-3xl bg-[color-mix(in_oklab,var(--sun)_22%,var(--paper))] p-4">
        <Icon name="lightbulb" size={26} fill className="mt-0.5 shrink-0 text-[#b7800b]" />
        <div data-speak>
          <p className="text-[12px] font-black text-[#9a6b06]">知ってた？</p>
          <p className="text-[15px] font-bold leading-relaxed"><RubyText text={ex.funFact} /></p>
        </div>
      </motion.div>

      <motion.div variants={item} className="mt-4 flex flex-wrap gap-2 px-6">
        <Button icon={saved ? 'library_add_check' : 'style'} iconFill onClick={onMakeCard}>
          {saved ? (notes ? 'カードを更新' : 'カードを見る') : 'カードにする'}
        </Button>
        <Speak target={root} ttsRef={{ name: ex.name }} autoStart />
        <Button tone="paper" icon="search" onClick={() => openExternal(`https://www.google.com/search?q=${encodeURIComponent(stripRuby(ex.name))}`)}>
          Google
        </Button>
      </motion.div>

      <SchoolUnits name={ex.name} />

      <motion.h3 variants={item} className="mt-8 flex items-center gap-2 px-6 text-[19px] font-black">
        <Icon name="explore" size={24} fill className="text-accent" />
        もっと知りたい！
      </motion.h3>
      <motion.ul variants={list} className="mt-3 grid gap-3 px-6 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {ex.topics.map((t, i) => (
          <motion.li key={t.id} variants={item}>
            <motion.button
              layoutId={`topic-${t.id}`}
              onClick={() => {
                haptic('select');
                onTopic(t.id);
              }}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.97 }}
              transition={spring}
              className="group relative flex w-full items-start gap-3 overflow-hidden rounded-3xl bg-paper-2 p-4 text-left"
            >
              <motion.span
                layoutId={`topic-icon-${t.id}`}
                className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
                style={{ background: TOPIC_COLORS[i % TOPIC_COLORS.length][0], color: TOPIC_COLORS[i % TOPIC_COLORS.length][1] }}
              >
                <Icon name={t.icon} size={26} fill />
              </motion.span>
              <span className="min-w-0 flex-1">
                <span className="text-[11px] font-black tracking-wider text-ink-3">{t.kind}</span>
                <motion.span layoutId={`topic-title-${t.id}`} className="block text-[16px] font-black leading-snug">
                  <RubyText text={t.title} />
                </motion.span>
                <span className="mt-1 block text-[13px] leading-relaxed text-ink-2"><RubyText text={t.teaser} /></span>
              </span>
              <Icon name="chevron_right" size={24} className="mt-3 text-ink-3 transition-transform group-hover:translate-x-1" />
            </motion.button>
          </motion.li>
        ))}
      </motion.ul>

      {ex.wiki && (
        <motion.a
          variants={item}
          href={ex.wiki.url}
          target="_blank"
          rel="noopener"
          className="mx-6 mt-6 flex gap-3 rounded-3xl border border-line p-4 transition-colors hover:bg-paper-2"
        >
          {ex.wiki.thumb && <img src={ex.wiki.thumb} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" loading="lazy" />}
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-[12px] font-black text-ink-3">
              <Icon name="menu_book" size={16} /> Wikipedia「{ex.wiki.title}」
            </span>
            <span className="mt-1 block text-[13px] leading-relaxed text-ink-2 line-clamp-3">{ex.wiki.extract}</span>
          </span>
        </motion.a>
      )}

      <motion.div variants={item} className="px-6">
        <SearchEntry html={ex.entryPoint} />
      </motion.div>

      <motion.div variants={item} className="mt-8 flex justify-center">
        <Button tone="ghost" icon="photo_camera" onClick={onReset}>
          ほかのモノを撮る
        </Button>
      </motion.div>
    </motion.div>
  );
}

// "学校でならうよ": the curriculum units this thing comes up in. Nothing is shown when there are none.
function SchoolUnits({ name }: { name: string }) {
  const links = useUnitLinks(name);
  const { stage } = useStage();
  const mission = useMission();
  const achieved = mission?.done && links?.some((l) => l.id === mission.unit.id) ? mission : null;
  // Units from school years already behind this person aren't shown; the rest are what's still ahead (or now).
  const shown = (links ?? []).filter((l) => {
    const u = unitById.get(l.id);
    return u && unitStatus(u, stage) !== 'done';
  });
  useEffect(() => {
    if (!links?.length) return;
    void api.events([{ name: 'unit_view' }]);
    if (completeMission(links.map((l) => l.id))) {
      haptic('success');
      toast('ミッション達成！', 'flag');
    }
  }, [links]);
  return (
    <AnimatePresence initial={false}>
      {(shown.length > 0 || achieved) && (
        <motion.section
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 34 }}
          className="overflow-hidden"
          aria-label="学校でならうよ"
        >
          {achieved && <MissionDone mission={achieved} />}
          {shown.length > 0 && (
            <>
              <h3 className="mt-8 flex items-center gap-2 px-6 text-[19px] font-black">
                <Icon name="school" size={24} fill className="text-accent" />
                学校でならうよ
              </h3>
              <p className="mt-0.5 px-6 text-[13px] text-ink-3">このモノは、授業のこんなところに出てくるよ</p>
              <UnitChips links={shown} stage={stage} className="mt-3 px-6" />
            </>
          )}
        </motion.section>
      )}
    </AnimatePresence>
  );
}

function MissionDone({ mission }: { mission: Mission }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 420, damping: 22, delay: 0.1 } }}
      className="mx-6 mt-6 flex items-center gap-3 rounded-3xl bg-[color-mix(in_oklab,var(--leaf)_18%,var(--paper))] p-4"
      role="status"
    >
      <motion.span
        initial={{ rotate: -20, scale: 0.6 }}
        animate={{ rotate: 0, scale: 1, transition: { type: 'spring', stiffness: 500, damping: 14, delay: 0.25 } }}
        className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-leaf text-white"
      >
        <Icon name="flag" size={28} fill />
      </motion.span>
      <div className="min-w-0">
        <p className="text-[17px] font-black leading-snug">ミッション達成！</p>
        <p className="text-[13px] leading-relaxed text-ink-2">今日のミッション「{unitLabel(mission.unit)}」に出てくるモノを見つけたよ</p>
      </div>
    </motion.div>
  );
}

function Correction({ name, alts, onPick, onCancel }: { name: string; alts: string[]; onPick: (label: string) => void; onCancel: () => void }) {
  const [text, setText] = useState('');
  return (
    <motion.section
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      className="overflow-hidden"
      aria-label="名前をなおす"
    >
      <div className="mx-6 mt-4 rounded-3xl bg-paper-2 p-4">
        <p className="font-black">写っているのは何かな？</p>
        <p className="mt-0.5 text-[13px] text-ink-2">「{name}」ではないときは、正しい名前を選ぶか入れてね。同じ写真で調べなおします。</p>
        {alts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {alts.map((a) => (
              <Button key={a} tone="paper" className="h-10 px-4" onClick={() => onPick(a)}>
                {a}
              </Button>
            ))}
          </div>
        )}
        <form
          className="mt-3 flex items-center gap-2 rounded-full bg-paper p-1.5 pl-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) onPick(text.trim());
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="正しい名前（例: ふせん）"
            aria-label="正しい名前"
            className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none placeholder:text-ink-3"
            maxLength={30}
            autoFocus
          />
          <Button type="submit" icon="search" className="h-10 px-4" disabled={!text.trim()}>
            調べなおす
          </Button>
        </form>
        <div className="mt-2 flex justify-end">
          <Button tone="ghost" className="h-10 px-4 text-[14px]" onClick={onCancel}>
            やめる
          </Button>
        </div>
      </div>
    </motion.section>
  );
}

// Shown once, to the person whose photo made this thing's page. The one celebratory moment in the flow.
function FirstFind({ name, saved }: { name: string; saved: boolean }) {
  useEffect(() => {
    haptic('success');
  }, []);
  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.9, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 420, damping: 22, delay: 0.15 } }}
      className="mx-6 mb-4 flex items-center gap-3 rounded-3xl bg-[color-mix(in_oklab,var(--sun)_30%,var(--paper))] p-4"
      role="status"
    >
      <motion.span
        initial={{ rotate: -20, scale: 0.6 }}
        animate={{ rotate: 0, scale: 1, transition: { type: 'spring', stiffness: 500, damping: 14, delay: 0.3 } }}
        className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sun text-[#5a3b00]"
      >
        <Icon name="flag" size={28} fill />
      </motion.span>
      <div className="min-w-0">
        <p className="text-[17px] font-black leading-snug">はじめて見つけたモノ！</p>
        <p className="text-[13px] leading-relaxed text-ink-2">
          モノシリで「{name}」を調べたのは、あなたが最初です。{saved ? '' : 'カードにして図鑑にのこそう'}
        </p>
      </div>
    </motion.section>
  );
}

function ErrorState({ message, onRetry, onReset }: { message: string | null; onRetry: () => void; onReset: () => void }) {
  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="px-6 pt-2 pb-10 text-center">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-accent-soft text-accent">
          <Icon name="sentiment_dissatisfied" size={40} fill />
        </div>
        <p className="mt-4 text-[18px] font-black">ごめんなさい</p>
        <p className="mt-1 text-ink-2">{message}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button icon="refresh" onClick={onRetry}>もう一度</Button>
          <Button tone="paper" icon="photo_camera" onClick={onReset}>撮りなおす</Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
