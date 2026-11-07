import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { api, errorMessage, mediaUrl } from '../lib/api';
import type { CommonsImage, DeepMeta, DeepNote, Explore, Quiz as QuizT, Topic, Video } from '../lib/types';
import { useCards } from '../lib/cards';
import { Markdown } from '../components/Markdown';
import { RollingCards } from '../components/RollingCards';
import { SearchEntry } from '../components/SearchEntry';
import { Speak } from '../components/Speak';
import { toast } from '../components/Toast';
import { Button, Icon, IconButton, spring } from '../components/ui';
import { TOPIC_COLORS } from './ExploreContent';
import { haptic, onBack, openExternal } from '../lib/native';

type Tab = 'photos' | 'videos' | 'diagram' | 'ai' | 'quiz';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'photos', label: '写真', icon: 'photo_library' },
  { id: 'videos', label: '動画', icon: 'smart_display' },
  { id: 'diagram', label: '図解', icon: 'draw' },
  { id: 'ai', label: 'AI動画', icon: 'movie' },
  { id: 'quiz', label: 'クイズ', icon: 'quiz' },
];

export function TopicPanel({ ex, topic, index, note, onNote, onClose }: {
  ex: Explore; topic: Topic; index: number; note?: DeepNote; onNote: (n: DeepNote) => void; onClose: () => void;
}) {
  const [text, setText] = useState(note?.text ?? '');
  const [meta, setMeta] = useState<DeepMeta | null>(note ? { sources: note.sources, queries: [], entryPoint: null } : null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('photos');
  const [media, setMedia] = useState<{ images: CommonsImage[]; videos: Video[] } | null>(null);
  const [diagram, setDiagram] = useState<string | null>(note?.diagram ?? null);
  const [video, setVideo] = useState<string | null>(note?.video ?? null);
  const cards = useCards();
  const color = TOPIC_COLORS[index % TOPIC_COLORS.length];
  const done = !!meta;
  const noteRef = useRef<DeepNote | null>(note ?? null);

  const save = (patch: Partial<DeepNote>) => {
    const n: DeepNote = { topicId: topic.id, title: topic.title, icon: topic.icon, text, sources: meta?.sources ?? [], ...noteRef.current, ...patch };
    noteRef.current = n;
    onNote(n);
  };

  useEffect(() => {
    const ac = new AbortController();
    api.media(ex.name, ex.en, topic.title).then(setMedia).catch(() => setMedia({ images: [], videos: [] }));
    if (!note?.text) {
      let acc = '';
      api
        .deep(ex.name, topic.title, (d) => {
          acc += d;
          setText(acc);
        }, ac.signal)
        .then((m) => {
          setMeta(m);
          noteRef.current = { topicId: topic.id, title: topic.title, icon: topic.icon, text: acc, sources: m.sources };
          onNote(noteRef.current);
        })
        .catch((e) => {
          const m = errorMessage(e);
          if (m) setErr(m);
        });
    }
    const off = onBack(onClose);
    return () => {
      ac.abort();
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic.id]);

  const outline = text.replace(/```[\s\S]*?```/g, '').slice(0, 700);

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" initial={{ opacity: 1 }} exit={{ opacity: 1 }}>
      <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.article
        layoutId={`topic-${topic.id}`}
        transition={{ type: 'spring', stiffness: 300, damping: 32 }}
        className="relative flex h-[96dvh] w-full flex-col overflow-hidden rounded-t-[32px] bg-paper lg:h-[90dvh] lg:max-w-3xl lg:rounded-[32px]"
        role="dialog"
        aria-modal
        aria-label={topic.title}
      >
        <header className="relative shrink-0 px-6 pb-5 pt-5" style={{ background: color[0] }}>
          <div className="flex items-start justify-between gap-3">
            <motion.span layoutId={`topic-icon-${topic.id}`} className="grid h-14 w-14 place-items-center rounded-2xl bg-white/70" style={{ color: color[1] }}>
              <Icon name={topic.icon} size={30} fill />
            </motion.span>
            <IconButton icon="close" label="とじる" tone="paper" onClick={onClose} />
          </div>
          <p className="mt-3 text-[12px] font-black tracking-wider" style={{ color: color[1] }}>
            {ex.name} ・ {topic.kind}
          </p>
          <motion.h2 layoutId={`topic-title-${topic.id}`} className="text-[24px] font-black leading-snug text-[#2a2017] sm:text-[28px]">
            {topic.title}
          </motion.h2>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain no-scrollbar">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.2 } }} className="px-6 pb-16 pt-5">
            {err ? (
              <div className="rounded-3xl bg-accent-soft p-5 text-center">
                <p className="font-bold">{err}</p>
              </div>
            ) : !text ? (
              <div>
                <p className="text-[14px] font-bold text-ink-2">Google 検索で確かめながら、まとめています…</p>
                <RollingCards cards={cards} height={200} count={6} />
              </div>
            ) : (
              <>
                <Markdown text={text} streaming={!done} />
              </>
            )}

            {done && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 flex flex-wrap gap-2">
                <Speak text={text} />
                <Button
                  tone="paper"
                  icon="search"
                  onClick={() => openExternal(`https://www.google.com/search?q=${encodeURIComponent(`${ex.name} ${topic.title}`)}`)}
                >
                  Googleで検索
                </Button>
              </motion.div>
            )}

            <section className="mt-9">
              <h3 className="flex items-center gap-2 text-[18px] font-black">
                <Icon name="visibility" size={22} fill className="text-accent" /> 見て・ためして わかる
              </h3>
              <div className="mt-3 flex gap-1 overflow-x-auto rounded-full bg-paper-2 p-1 no-scrollbar" role="tablist">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={tab === t.id}
                    onClick={() => {
                      haptic('select');
                      setTab(t.id);
                    }}
                    className="relative flex h-10 flex-1 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full px-3 text-[14px] font-bold"
                  >
                    {tab === t.id && <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-full bg-paper shadow-[var(--shadow-card)]" transition={spring} />}
                    <span className={`relative flex items-center gap-1 ${tab === t.id ? 'text-ink' : 'text-ink-3'}`}>
                      <Icon name={t.icon} size={18} fill={tab === t.id} />
                      {t.label}
                    </span>
                  </button>
                ))}
              </div>
              <AnimatePresence mode="wait">
                <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }} className="mt-4">
                  {tab === 'photos' && <Photos items={media?.images} />}
                  {tab === 'videos' && <Videos items={media?.videos} query={`${ex.name} ${topic.title}`} />}
                  {tab === 'diagram' && (
                    <Diagram
                      url={diagram}
                      ready={done}
                      make={async () => {
                        const { url } = await api.diagram({ name: ex.name, en: ex.en, topic: topic.title, outline });
                        setDiagram(url);
                        save({ diagram: url });
                      }}
                    />
                  )}
                  {tab === 'ai' && (
                    <AiVideo
                      url={video}
                      ready={done}
                      start={() => api.video({ name: ex.name, en: ex.en, topic: topic.title, outline })}
                      onDone={(url) => {
                        setVideo(url);
                        save({ video: url });
                      }}
                    />
                  )}
                  {tab === 'quiz' && <Quiz name={ex.name} context={done ? `${topic.title}\n${outline}` : ''} />}
                </motion.div>
              </AnimatePresence>
            </section>

            {done && meta && meta.sources.length > 0 && (
              <section className="mt-9">
                <h3 className="flex items-center gap-2 text-[16px] font-black">
                  <Icon name="link" size={20} className="text-ink-3" /> 参考にしたページ
                </h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {meta.sources.slice(0, 8).map((s) => (
                    <li key={s.uri}>
                      <a href={s.uri} target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-full bg-paper-2 px-3 py-1.5 text-[13px] font-bold text-ink-2 hover:bg-paper-3">
                        <Icon name="open_in_new" size={14} />
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {meta?.entryPoint && <SearchEntry html={meta.entryPoint} />}
          </motion.div>
        </div>
      </motion.article>
    </motion.div>
  );
}

function Photos({ items }: { items?: CommonsImage[] }) {
  const [open, setOpen] = useState<CommonsImage | null>(null);
  if (!items) return <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton aspect-square" />)}</div>;
  if (!items.length) return <Empty icon="image_not_supported" text="ぴったりの写真が見つかりませんでした" />;
  return (
    <>
      <ul className="columns-2 gap-2 sm:columns-3">
        {items.map((im, i) => (
          <motion.li key={im.page} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04 }} className="mb-2 break-inside-avoid">
            <button onClick={() => setOpen(im)} className="block w-full overflow-hidden rounded-2xl bg-paper-2">
              <img src={im.thumb} alt={im.title} loading="lazy" className="w-full transition-transform duration-500 hover:scale-105" style={{ aspectRatio: `${im.width}/${im.height}` }} />
            </button>
          </motion.li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-ink-3">写真: Wikimedia Commons（タップで作者とライセンス）</p>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(null)}>
            <motion.figure initial={{ scale: 0.92 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="max-w-3xl" onClick={(e) => e.stopPropagation()}>
              <img src={open.thumb} alt={open.title} className="max-h-[70dvh] w-auto rounded-2xl" />
              <figcaption className="mt-3 text-[13px] text-white/85">
                {open.title} — {open.artist} / {open.license}{' '}
                <a href={open.page} target="_blank" rel="noopener" className="underline">出典</a>
              </figcaption>
            </motion.figure>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Videos({ items, query }: { items?: Video[]; query: string }) {
  const [play, setPlay] = useState<string | null>(null);
  if (!items) return <div className="grid gap-2 sm:grid-cols-2">{[0, 1].map((i) => <div key={i} className="skeleton aspect-video" />)}</div>;
  return (
    <div>
      {items.length === 0 && <Empty icon="smart_display" text="動画はYouTubeで探してみよう" />}
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((v) => (
          <li key={v.id} className="overflow-hidden rounded-2xl bg-paper-2">
            <div className="relative aspect-video">
              {play === v.id ? (
                <iframe
                  className="absolute inset-0 h-full w-full"
                  src={`https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0`}
                  title={v.title}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <button className="group absolute inset-0" onClick={() => setPlay(v.id)} aria-label={`${v.title}を再生`}>
                  <img src={v.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                  <span className="absolute inset-0 grid place-items-center bg-black/10 transition-colors group-hover:bg-black/25">
                    <span className="grid h-14 w-14 place-items-center rounded-full bg-white/90 text-accent shadow-lg transition-transform group-hover:scale-110">
                      <Icon name="play_arrow" size={34} fill />
                    </span>
                  </span>
                </button>
              )}
            </div>
            <p className="px-3 py-2 text-[13px] font-bold leading-snug line-clamp-2">{v.title}</p>
          </li>
        ))}
      </ul>
      <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`} target="_blank" rel="noopener" className="mt-3 inline-flex items-center gap-1 text-[13px] font-bold text-leaf">
        <Icon name="open_in_new" size={16} /> YouTubeでもっと見る
      </a>
    </div>
  );
}

function Diagram({ url, ready, make }: { url: string | null; ready: boolean; make: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  if (url) {
    return (
      <motion.figure initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
        <img src={mediaUrl(url)} alt="AIが描いた図解イラスト" className="w-full rounded-3xl shadow-[var(--shadow-card)]" />
        <figcaption className="mt-2 text-[11px] text-ink-3">AI（Gemini）が描いた図解イラストです。細部は本文で確かめてね。</figcaption>
      </motion.figure>
    );
  }
  return (
    <div className="rounded-3xl bg-paper-2 p-5 text-center">
      {busy ? (
        <div className="py-6">
          <Icon name="brush" size={44} fill className="animate-bounce text-accent" />
          <p className="mt-2 font-bold">絵の具を混ぜています…</p>
          <p className="text-[13px] text-ink-3">20秒ほどかかります</p>
        </div>
      ) : (
        <>
          <p className="font-bold">このテーマを1枚のイラストで図解します</p>
          <Button
            className="mt-3"
            icon="draw"
            disabled={!ready}
            onClick={async () => {
              setBusy(true);
              try {
                await make();
              } catch (e) {
                const m = errorMessage(e);
                if (m) toast(m);
              } finally {
                setBusy(false);
              }
            }}
          >
            {ready ? '図解イラストをつくる' : '説明が終わるのを待っています'}
          </Button>
        </>
      )}
    </div>
  );
}

function AiVideo({ url, ready, start, onDone }: { url: string | null; ready: boolean; start: () => Promise<{ status: string; id?: string; url?: string }>; onDone: (url: string) => void }) {
  const [state, setState] = useState<'idle' | 'confirm' | 'busy'>('idle');
  const [left, setLeft] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    api.usage().then((u) => setLeft(u.videoLeft)).catch(() => setLeft(null));
  }, []);

  const run = async () => {
    setState('busy');
    setElapsed(0);
    const t0 = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    try {
      const r = await start();
      if (r.url) return onDone(r.url);
      for (let i = 0; i < 80 && r.id; i++) {
        await new Promise((res) => setTimeout(res, 5000));
        const s = await api.videoStatus(r.id);
        if (s.status === 'completed' && s.url) return onDone(s.url);
        if (s.status === 'failed' || s.status === 'cancelled') throw new Error('failed');
      }
      throw new Error('timeout');
    } catch (e) {
      toast(errorMessage(e) || '動画をつくれませんでした');
      setState('idle');
    } finally {
      clearInterval(timer);
    }
  };

  if (url) {
    return (
      <motion.figure initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
        <video src={mediaUrl(url)} controls playsInline autoPlay className="w-full rounded-3xl bg-black" />
        <figcaption className="mt-2 text-[11px] text-ink-3">AI（Gemini Omni）がつくった短い動画です。</figcaption>
      </motion.figure>
    );
  }
  return (
    <div className="rounded-3xl bg-paper-2 p-5 text-center">
      {state === 'busy' ? (
        <div className="py-4">
          <div className="mx-auto flex w-40 gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.span key={i} className="h-14 flex-1 rounded-md bg-accent/70" animate={{ opacity: [0.25, 1, 0.25] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }} />
            ))}
          </div>
          <p className="mt-3 font-bold">動画を撮影中…（{elapsed}秒）</p>
          <p className="text-[13px] text-ink-3">1〜2分かかります。このまま待っていてね</p>
        </div>
      ) : state === 'confirm' ? (
        <>
          <p className="font-bold">AI動画は数が限られています。つくりますか？</p>
          <div className="mt-3 flex justify-center gap-2">
            <Button icon="movie" onClick={run}>つくる</Button>
            <Button tone="paper" onClick={() => setState('idle')}>やめる</Button>
          </div>
        </>
      ) : (
        <>
          <p className="font-bold">このテーマを6秒のアニメーションにします</p>
          <p className="text-[13px] text-ink-3">のこり {left ?? '-'} 本</p>
          <Button className="mt-3" icon="movie" disabled={!ready || left === 0} onClick={() => setState('confirm')}>
            {left === 0 ? '今日はもう作れません' : ready ? 'AI動画をつくる' : '説明が終わるのを待っています'}
          </Button>
        </>
      )}
    </div>
  );
}

function Quiz({ name, context }: { name: string; context: string }) {
  const [quiz, setQuiz] = useState<QuizT | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!context) return;
    api.quiz(name, context).then(setQuiz).catch(() => setErr(true));
  }, [name, context]);
  if (!context) return <Empty icon="hourglass_top" text="説明を読み終えたらクイズが出るよ" />;
  if (err) return <Empty icon="sentiment_dissatisfied" text="クイズを用意できませんでした" />;
  if (!quiz) return <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-20" />)}</div>;
  const score = quiz.questions.filter((q, i) => answers[i] === q.answer).length;
  const finished = Object.keys(answers).length === quiz.questions.length;
  return (
    <div className="space-y-4">
      {quiz.questions.map((q, i) => {
        const picked = answers[i];
        return (
          <div key={i} className="rounded-3xl bg-paper-2 p-4">
            <p className="font-black">
              <span className="mr-2 text-accent">Q{i + 1}</span>
              {q.q}
            </p>
            <div className="mt-3 grid gap-2">
              {q.choices.map((c, j) => {
                const state = picked == null ? 'idle' : j === q.answer ? 'right' : j === picked ? 'wrong' : 'dim';
                return (
                  <motion.button
                    key={j}
                    disabled={picked != null}
                    onClick={() => {
                      haptic(j === q.answer ? 'success' : 'error');
                      setAnswers((a) => ({ ...a, [i]: j }));
                    }}
                    whileTap={{ scale: 0.97 }}
                    animate={state === 'wrong' ? { x: [0, -8, 8, -5, 5, 0] } : state === 'right' ? { scale: [1, 1.04, 1] } : {}}
                    className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-left font-bold transition-colors ${
                      state === 'right' ? 'bg-leaf text-white' : state === 'wrong' ? 'bg-accent text-white' : state === 'dim' ? 'bg-paper text-ink-3' : 'bg-paper hover:bg-paper-3'
                    }`}
                  >
                    <Icon name={state === 'right' ? 'check_circle' : state === 'wrong' ? 'cancel' : 'radio_button_unchecked'} size={20} fill={state === 'right' || state === 'wrong'} />
                    {c}
                  </motion.button>
                );
              })}
            </div>
            {picked != null && (
              <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-2 text-[13px] text-ink-2">
                {q.explain}
              </motion.p>
            )}
          </div>
        );
      })}
      {finished && (
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }} className="rounded-3xl bg-ink p-5 text-center text-paper">
          <p className="text-[13px] font-bold opacity-70">けっか</p>
          <p className="text-[32px] font-black">
            {score} / {quiz.questions.length}
          </p>
          <p className="font-bold">{score === quiz.questions.length ? 'パーフェクト！モノシリ認定！' : 'もう一度読むと、きっと全問正解！'}</p>
        </motion.div>
      )}
    </div>
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="rounded-3xl bg-paper-2 p-6 text-center text-ink-3">
      <Icon name={icon} size={36} />
      <p className="mt-1 text-[14px] font-bold">{text}</p>
    </div>
  );
}
