import { AnimatePresence, motion } from 'motion/react';
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { api, errorMessage, mediaUrl } from '../lib/api';
import { saveCard, getCard, useCards } from '../lib/cards';
import { getFlow, resetFlow, setFlow, useFlow } from '../lib/flow';
import { cropBox, shotFromBlob, shotFromVideo, type Shot } from '../lib/image';
import type { Card, DeepNote } from '../lib/types';
import { CardMaker } from '../components/CardMaker';
import { ReadyBubble } from '../components/ReadyBubble';
import { Sheet } from '../components/Sheet';
import { useDesktop } from '../lib/useDesktop';
import { Stage } from '../components/Stage';
import { Viewfinder, type ViewfinderHandle } from '../components/Viewfinder';
import { toast } from '../lib/toast';
import { Icon, IconButton } from '../components/ui';
import { catStyle, spring } from '../components/theme';
import { usePendingIllust } from '../lib/illust';
import { ExploreContent } from './ExploreContent';
import { TopicPanel } from './TopicPanel';
import { Logo } from '../components/Logo';
import { goBack, haptic, onBack } from '../lib/native';
import { GlassChrome, nativeChrome, pickNativePhoto } from '../lib/glass';
import { useMe } from '../lib/firebase';
import { Avatar } from './Account';

export function Home({ paused = false }: { paused?: boolean }) {
  const flow = useFlow();
  const cards = useCards();
  const desktop = useDesktop();
  const navigate = useNavigate();
  const vf = useRef<ViewfinderHandle>(null);
  const file = useRef<HTMLInputElement>(null);
  const zukanBtn = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [making, setMaking] = useState(false);
  const [flash, setFlash] = useState(false);
  const [dragging, setDragging] = useState(false);
  const live = flow.stage === 'camera';
  useEffect(() => (live ? undefined : onBack(resetFlow)), [live]);
  // Coming back from the zukan or account screen, restart the camera only after their slide-out:
  // starting a stream mid-animation drops frames, and the preview would be hidden until then anyway.
  const [cameraPaused, setCameraPaused] = useState(paused);
  useEffect(() => {
    if (paused) return setCameraPaused(true);
    const t = setTimeout(() => setCameraPaused(false), 450);
    return () => clearTimeout(t);
  }, [paused]);

  const crops = useMemo(() => (flow.shot ? flow.objects.map((o) => cropBox(flow.shot!, o.box, 320).dataUrl) : []), [flow.shot, flow.objects]);

  async function analyze(shot: Shot) {
    setExpanded(false);
    setFlow({ stage: 'detecting', shot, objects: [], selected: null, explore: null, crop: null, notes: {}, error: null, topicId: null });
    try {
      const { objects } = await api.detect(shot.base64);
      if (getFlow().shot !== shot) return;
      setFlow({ stage: 'picked', objects });
      if (objects.length === 1) pick(0);
    } catch (e) {
      setFlow({ stage: 'error', error: errorMessage(e) });
    }
  }

  async function explore(label: string, crop: string | null, cropB64?: string, from?: string) {
    setFlow({ stage: 'exploring', crop, explore: null, notes: {}, error: null, known: null, label });
    void api.known(label).then(({ known }) => getFlow().stage === 'exploring' && setFlow({ known })).catch(() => {});
    try {
      const ex = await api.explore(label, cropB64, from);
      if (getFlow().stage !== 'exploring') return;
      // A correction renames the marker only once the new name worked, so "もう一度" after a failure retries the original.
      if (from) setFlow((s) => ({ objects: s.objects.map((x, i) => (i === s.selected ? { ...x, label, alts: [] } : x)) }));
      const saved = getCard(ex.id);
      const notes = Object.fromEntries((saved?.notes ?? []).map((n) => [n.topicId, n]));
      setFlow({ stage: 'explore', explore: ex, notes });
    } catch (e) {
      setFlow({ stage: 'error', error: errorMessage(e) });
    }
  }

  function pick(i: number) {
    const s = getFlow();
    if (!s.shot) return;
    const o = s.objects[i];
    const c = cropBox(s.shot, o.box, 640);
    haptic('select');
    setFlow({ selected: i });
    void explore(o.label, c.dataUrl, c.base64);
  }

  // The person says the photo was misread: rename the marker and explore the name they chose, with the same photo crop.
  function correct(label: string) {
    const s = getFlow();
    if (!s.shot || s.selected == null) return;
    const o = s.objects[s.selected];
    if (!o || label === o.label) return;
    const c = cropBox(s.shot, o.box, 640);
    haptic('select');
    void explore(label, c.dataUrl, c.base64, o.label);
  }

  async function capture() {
    const v = vf.current;
    if (!v?.live || !v.video) return pickPhoto();
    haptic('tap');
    setFlash(true);
    setTimeout(() => setFlash(false), 260);
    analyze(await shotFromVideo(v.video, v.visibleRect()));
  }

  async function pickPhoto() {
    if (!nativeChrome) return file.current?.click();
    try {
      const blob = await pickNativePhoto();
      if (blob) analyze(await shotFromBlob(blob));
    } catch {
      toast('この画像は読み込めませんでした');
    }
  }

  async function fromFile(f: File | null | undefined) {
    if (!f || !f.type.startsWith('image/')) return;
    try {
      analyze(await shotFromBlob(f));
    } catch {
      toast('この画像は読み込めませんでした');
    }
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
      if (f) fromFile(f);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onNote(n: DeepNote) {
    setFlow((s) => ({ notes: { ...s.notes, [n.topicId]: n } }));
    const ex = getFlow().explore;
    const card = ex && getCard(ex.id);
    if (card) {
      const others = card.notes.filter((x) => x.topicId !== n.topicId);
      void saveCard({ ...card, notes: [...others, n], updatedAt: Date.now() });
    }
  }

  const topicIndex = flow.explore?.topics.findIndex((t) => t.id === flow.topicId) ?? -1;
  const topic = topicIndex >= 0 ? flow.explore!.topics[topicIndex] : null;
  const peek = flow.stage === 'explore' ? Math.round(window.innerHeight * 0.5) : flow.stage === 'picked' ? 360 : 300;

  const handlers = useRef({ capture, pickPhoto, navigate });
  useEffect(() => {
    handlers.current = { capture, pickPhoto, navigate };
  });
  useEffect(() => {
    if (!nativeChrome) return;
    const sub = GlassChrome.addListener('tap', ({ id }) => {
      const h = handlers.current;
      if (id === 'shutter') void h.capture();
      else if (id === 'gallery') void h.pickPhoto();
      else if (id === 'zukan') h.navigate({ to: '/zukan' });
      else if (id === 'close') resetFlow();
    });
    return () => void sub.then((x) => x.remove());
  }, []);
  useEffect(() => {
    if (nativeChrome) void GlassChrome.setCameraControls({ visible: live && !paused, count: cards.length });
  }, [live, paused, cards.length]);
  const showClose = !live && !paused && !topic && !making && !(expanded && !desktop);
  useEffect(() => {
    if (nativeChrome) void GlassChrome.setCloseButton({ visible: showClose });
  }, [showClose]);

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-[#120e0b] text-white"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        fromFile(e.dataTransfer.files[0]);
      }}
    >
      <Viewfinder
        ref={vf}
        active={live && !cameraPaused}
        onPick={() => file.current?.click()}
        onSample={async (src) => {
          const b = await fetch(src).then((r) => r.blob());
          analyze(await shotFromBlob(b));
        }}
      />

      <AnimatePresence>
        {!live && flow.shot && (
          <motion.div key="stage" className="absolute inset-0 bg-[#120e0b]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 px-3 pt-[calc(env(safe-area-inset-top)+64px)] lg:pr-[calc(min(480px,42vw)+32px)] lg:pl-8 lg:pb-8">
              <div className="relative h-full w-full">
                <Stage
                  src={flow.shot.url}
                  ratio={flow.shot.width / flow.shot.height}
                  objects={flow.objects}
                  selected={flow.selected}
                  scanning={flow.stage === 'detecting'}
                  onSelect={pick}
                  bottomInset={desktop ? 0 : expanded ? 0 : peek - 8}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{flash && <motion.div className="absolute inset-0 z-40 bg-white" initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} />}</AnimatePresence>

      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),14px)] lg:px-8 lg:pr-[calc(min(480px,42vw)+32px)]">
        <AnimatePresence mode="wait">
          {live ? (
            <motion.div key="logo" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <Logo light />
            </motion.div>
          ) : (
            <motion.div key="back" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
              {!nativeChrome && <IconButton icon="close" label="カメラにもどる" tone="glass" onClick={resetFlow} />}
            </motion.div>
          )}
        </AnimatePresence>
        {(live || desktop) && (
          <motion.div key="right" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2.5">
            <div className="relative hidden lg:block">
              <ZukanButton ref={zukanBtn} count={cards.length} cards={cards.slice(0, 3)} onClick={() => navigate({ to: '/zukan' })} />
              {!paused && <ReadyBubble placement="below" radius={999} tail={60} />}
            </div>
            <AccountButton hasCards={cards.length > 0} onClick={() => navigate({ to: '/account' })} />
          </motion.div>
        )}
      </header>

      <AnimatePresence>
        {live && (
          <motion.div
            key="controls"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={spring}
            className="absolute inset-x-0 bottom-0 z-20 pb-[max(env(safe-area-inset-bottom),24px)]"
          >
            <p className="mb-5 text-center text-[15px] font-bold text-white/85 drop-shadow">気になるモノを撮ってみよう</p>
            {nativeChrome ? (
              <div className="h-[98px]" aria-hidden />
            ) : (
            <div className="mx-auto flex max-w-sm items-center justify-between px-8">
              <IconButton icon="photo_library" label="写真をえらぶ" tone="glass" size={56} onClick={() => file.current?.click()} />
              <Shutter onClick={capture} />
              {desktop ? (
                <IconButton icon="content_paste" label="画像を貼り付け（Ctrl+V）" tone="glass" size={56} onClick={() => toast('画像をコピーして Ctrl+V（⌘+V）で貼り付けできます', 'content_paste')} />
              ) : (
                <div className="relative">
                  <MiniZukan ref={zukanBtn} cards={cards} onClick={() => navigate({ to: '/zukan' })} />
                  {!paused && <ReadyBubble placement="above" radius={10} tail={19} />}
                </div>
              )}
            </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dragging && (
          <motion.div className="absolute inset-4 z-50 grid place-items-center rounded-[36px] border-4 border-dashed border-white/60 bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="text-[22px] font-black">ここに写真をドロップ</p>
          </motion.div>
        )}
      </AnimatePresence>

      {nativeChrome && live && !paused && (
        <div
          className="pointer-events-none absolute z-20 h-[58px] w-[58px]"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 26px)', right: 'calc(50% - min(160px, 50vw - 32px))' }}
        >
          <ReadyBubble placement="above" radius={29} tail={23} />
        </div>
      )}

      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => fromFile(e.target.files?.[0])} />

      <div className="text-ink">
        <Sheet open={!live} expanded={expanded} onExpandedChange={setExpanded} onDismiss={goBack} peek={peek}>
          <ExploreContent
            flow={flow}
            crops={crops}
            onPick={pick}
            onAsk={(label) => explore(label, null)}
            onCorrect={correct}
            onTopic={(id) => setFlow({ topicId: id })}
            onMakeCard={() => setMaking(true)}
            onRetry={() => (flow.selected != null ? pick(flow.selected) : flow.shot ? analyze(flow.shot) : resetFlow())}
            onReset={resetFlow}
          />
        </Sheet>

        <AnimatePresence>
          {topic && flow.explore && (
            <TopicPanel
              key={topic.id}
              ex={flow.explore}
              topic={topic}
              index={topicIndex}
              note={flow.notes[topic.id]}
              onNote={onNote}
              onClose={() => setFlow({ topicId: null })}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {making && flow.explore && (
            <CardMaker
              ex={flow.explore}
              notes={Object.values(flow.notes)}
              onClose={() => setMaking(false)}
              flyTo={() => {
                const r = zukanBtn.current?.getBoundingClientRect();
                return r && r.width > 0 ? r : new DOMRect(window.innerWidth - 64, 16, 44, 44);
              }}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function AccountButton({ hasCards, onClick }: { hasCards: boolean; onClick: () => void }) {
  const me = useMe();
  const member = me && !me.guest;
  const dot = !me ? null : me.guest ? (hasCards ? 'bg-accent' : null) : me.provider === 'password' && !me.verified ? 'bg-sun' : null;
  const label = !member ? 'ログイン・登録' : me.provider === 'password' && !me.verified ? 'アカウント（メールの確認が必要です）' : 'アカウント';
  return (
    <motion.button
      aria-label={label}
      title={label}
      onClick={onClick}
      whileTap={{ scale: 0.88 }}
      whileHover={{ scale: 1.05 }}
      transition={spring}
      className="glass relative grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/35 text-white backdrop-blur-xl"
    >
      <AnimatePresence mode="wait" initial={false}>
        {member ? (
          <motion.span key={me.uid} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={spring}>
            <Avatar me={me} size={36} />
          </motion.span>
        ) : (
          <motion.span key="guest" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={spring} className="grid">
            <Icon name="person" size={24} fill />
          </motion.span>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {dot && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: 'spring', stiffness: 600, damping: 15 }}
            className={`absolute right-0 top-0 h-3 w-3 rounded-full ring-2 ring-black/40 ${dot}`}
          />
        )}
      </AnimatePresence>
    </motion.button>
  );
}

function Shutter({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      aria-label="撮影する"
      onClick={onClick}
      whileTap={{ scale: 0.86 }}
      whileHover={{ scale: 1.05 }}
      transition={spring}
      className="relative grid h-[84px] w-[84px] place-items-center rounded-full border-[5px] border-white/95 shadow-[0_8px_30px_rgb(0_0_0/0.35)]"
    >
      <motion.span className="h-[64px] w-[64px] rounded-full bg-white" whileTap={{ scale: 0.8 }} />
      <span className="absolute grid h-[64px] w-[64px] place-items-center text-accent">
        <Icon name="travel_explore" size={30} fill />
      </span>
    </motion.button>
  );
}

const MiniZukan = forwardRef<HTMLButtonElement, { cards: Card[]; onClick: () => void }>(function MiniZukan({ cards, onClick }, ref) {
  const top = cards.slice(0, 3);
  return (
    <motion.button ref={ref} onClick={onClick} aria-label={`図鑑をひらく（${cards.length}枚）`} whileTap={{ scale: 0.9 }} transition={spring} className="relative h-[60px] w-[50px]">
      {top.length === 0 ? (
        <span className="grid h-full w-full place-items-center rounded-xl border-2 border-white/50 bg-black/30 backdrop-blur-md">
          <Icon name="style" size={24} />
        </span>
      ) : (
        top
          .slice()
          .reverse()
          .map((c, i, arr) => (
            <motion.span
              key={c.id}
              layout
              className="absolute inset-0 overflow-hidden rounded-[10px] border-2 border-white shadow-lg"
              style={{ rotate: (arr.length - 1 - i) * -7, x: (arr.length - 1 - i) * -4 }}
            >
              <CardThumb card={c} />
            </motion.span>
          ))
      )}
      {cards.length > 0 && (
        <motion.span key={cards.length} initial={{ scale: 1.8 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 15 }} className="absolute -right-2 -top-2 grid h-6 min-w-6 place-items-center rounded-full bg-accent px-1.5 text-[12px] font-black text-white">
          {cards.length}
        </motion.span>
      )}
    </motion.button>
  );
});

// The stack is only 50px wide, so it shows just the card's art instead of a shrunken card face.
function CardThumb({ card }: { card: Card }) {
  const c = catStyle(card.category);
  const drawing = usePendingIllust().has(card.id) && !card.illustration;
  return (
    <span className="block h-full w-full bg-[#fffdf8] p-[3px]">
      <span className="relative grid h-full w-full place-items-center overflow-hidden rounded-[6px]" style={{ background: c.bg }}>
        {card.illustration ? (
          <motion.img
            key={card.illustration}
            src={mediaUrl(card.illustration)}
            alt=""
            draggable={false}
            initial={{ opacity: 0, scale: 1.15 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="h-full w-full object-cover mix-blend-multiply"
          />
        ) : (
          <Icon name={card.icon} size={22} fill style={{ color: c.ink }} />
        )}
        {drawing && (
          <span className="absolute inset-0 grid place-items-center bg-white/45">
            <Icon name="brush" size={16} fill className="animate-bounce" style={{ color: c.ink }} />
          </span>
        )}
      </span>
    </span>
  );
}

const ZukanButton = forwardRef<HTMLButtonElement, { count: number; cards: Card[]; onClick: () => void }>(function ZukanButton({ count, onClick }, ref) {
  return (
    <motion.button
      ref={ref}
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      whileHover={{ y: -1 }}
      transition={spring}
      className="hidden items-center gap-2 rounded-full border border-white/15 bg-black/35 py-2 pl-3 pr-4 font-bold text-white backdrop-blur-xl hover:bg-black/45 lg:inline-flex"
    >
      <Icon name="style" size={22} fill />
      モノシリ図鑑
      <motion.span key={count} initial={{ scale: 1.6 }} animate={{ scale: 1 }} className="rounded-full bg-accent px-2 text-[13px] leading-6 text-white">
        {count}
      </motion.span>
    </motion.button>
  );
});
