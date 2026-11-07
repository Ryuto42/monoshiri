import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { DetectedObject, Explore } from '../lib/types';
import type { Flow } from '../lib/flow';
import { useCards } from '../lib/cards';
import { RollingCards } from '../components/RollingCards';
import { SearchEntry } from '../components/SearchEntry';
import { Button, Chip, Icon, IconButton } from '../components/ui';
import { catStyle, spring, TOPIC_COLORS } from '../components/theme';
import { Speak } from '../components/Speak';
import { haptic, openExternal } from '../lib/native';

const list = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } };
const item = { hidden: { opacity: 0, y: 18, scale: 0.97 }, show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 30 } } } as const;

export function ExploreContent({ flow, crops, onPick, onAsk, onTopic, onMakeCard, onRetry, onReset }: {
  flow: Flow; crops: string[]; onPick: (i: number) => void; onAsk: (label: string) => void; onTopic: (id: string) => void;
  onMakeCard: () => void; onRetry: () => void; onReset: () => void;
}) {
  if (flow.stage === 'error') return <ErrorState message={flow.error} onRetry={onRetry} onReset={onReset} />;
  if (flow.stage === 'exploring') return <Exploring label={flow.objects[flow.selected ?? 0]?.label ?? ''} crop={flow.crop} />;
  if (flow.stage === 'explore' && flow.explore) return <ExploreView ex={flow.explore} crop={flow.crop} onTopic={onTopic} onMakeCard={onMakeCard} onReset={onReset} notes={Object.keys(flow.notes).length} />;
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

function Exploring({ label, crop }: { label: string; crop: string | null }) {
  const cards = useCards();
  return (
    <div className="pt-1 pb-6">
      <div className="flex items-center gap-4 px-6">
        {crop && <motion.img layoutId="crop" src={crop} alt="" className="h-16 w-16 rounded-2xl object-cover shadow-[var(--shadow-card)]" />}
        <div>
          <p className="text-[13px] font-bold text-accent">モノシリ中…</p>
          <h2 className="text-[26px] font-black leading-tight">{label}</h2>
        </div>
      </div>
      <p className="mt-3 px-6 text-[14px] text-ink-2">Google 検索で確かめながら、学べるテーマを集めています</p>
      <RollingCards cards={cards} height={230} />
    </div>
  );
}

function ExploreView({ ex, crop, onTopic, onMakeCard, onReset, notes }: {
  ex: Explore; crop: string | null; onTopic: (id: string) => void; onMakeCard: () => void; onReset: () => void; notes: number;
}) {
  const c = catStyle(ex.category);
  const cards = useCards();
  const saved = cards.some((x) => x.id === ex.id);
  return (
    <motion.div initial="hidden" animate="show" variants={list} className="pb-10">
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
            {ex.cached && <Chip className="bg-leaf-soft text-leaf" icon="bolt">すぐ表示</Chip>}
          </div>
          <p className="mt-1 text-[12px] font-bold tracking-wider text-ink-3">{ex.reading}・{ex.en}</p>
          <h2 className="text-[28px] font-black leading-tight">{ex.name}</h2>
        </div>
      </motion.header>

      <motion.p variants={item} className="mt-4 px-6 text-[17px] font-bold leading-relaxed text-accent">
        {ex.oneLiner}
      </motion.p>
      <motion.p variants={item} className="mt-2 px-6 text-ink-2">
        {ex.summary}
      </motion.p>

      <motion.div variants={item} className="mx-6 mt-4 flex gap-3 rounded-3xl bg-[color-mix(in_oklab,var(--sun)_22%,var(--paper))] p-4">
        <Icon name="lightbulb" size={26} fill className="mt-0.5 shrink-0 text-[#b7800b]" />
        <div>
          <p className="text-[12px] font-black text-[#9a6b06]">知ってた？</p>
          <p className="text-[15px] font-bold leading-relaxed">{ex.funFact}</p>
        </div>
      </motion.div>

      <motion.div variants={item} className="mt-4 flex flex-wrap gap-2 px-6">
        <Button icon={saved ? 'library_add_check' : 'style'} iconFill onClick={onMakeCard}>
          {saved ? (notes ? 'カードを更新' : 'カードを見る') : 'カードにする'}
        </Button>
        <Speak text={`${ex.name}。${ex.oneLiner}。${ex.summary}。知ってた？${ex.funFact}`} />
        <Button tone="paper" icon="search" onClick={() => openExternal(`https://www.google.com/search?q=${encodeURIComponent(ex.name)}`)}>
          Google
        </Button>
      </motion.div>

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
                  {t.title}
                </motion.span>
                <span className="mt-1 block text-[13px] leading-relaxed text-ink-2">{t.teaser}</span>
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
