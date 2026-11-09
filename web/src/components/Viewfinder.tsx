import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { animate, AnimatePresence, motion, type AnimationPlaybackControls } from 'motion/react';
import { Icon } from './ui';
import { Phrases } from './Phrases';
import { KidText } from './RubyText';
import { stripRuby } from '../lib/ruby';
import { spring } from './theme';
import { haptic } from '../lib/native';
import { BLANK_POSTER } from '../lib/media';
import { PASTE_KEY } from '../lib/useDesktop';
import { toast } from '../lib/toast';
import {
  applyHardwareZoom,
  constraintsFor,
  formatZoom,
  listCameras,
  nextChoice,
  saveChoice,
  savedChoice,
  zoomPresets,
  zoomRange,
  type Camera,
  type Choice,
  type Facing,
  type ZoomRange,
} from '../lib/camera';

export type Rect = { sx: number; sy: number; sw: number; sh: number };
export type ViewfinderHandle = { video: HTMLVideoElement | null; live: boolean; blocked: boolean; visibleRect: () => Rect | null };

const SAMPLES = [
  { src: '/samples/desk.webp', label: 'つくえの上《うえ》' },
  { src: '/samples/park.webp', label: '秋《あき》の公園《こうえん》' },
  { src: '/samples/kitchen.webp', label: 'キッチン' },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Where the preview (object-cover, then the on-screen zoom around the centre) puts the camera frame inside a W×H box.
function coverLayout(vw: number, vh: number, W: number, H: number, zoom: number) {
  const s = Math.max(W / vw, H / vh) * zoom;
  return { s, dx: (W - vw * s) / 2, dy: (H - vh * s) / 2 };
}

const firstFrame = (v: HTMLVideoElement) =>
  new Promise<void>((resolve) => {
    const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => void }).requestVideoFrameCallback;
    if (rvfc) rvfc.call(v, () => resolve());
    else setTimeout(resolve, 120);
    setTimeout(resolve, 600);
  });

type Swap = 'flip' | 'fade';

export const Viewfinder = forwardRef<ViewfinderHandle, { active: boolean; onPick: () => void; onSample: (src: string) => void }>(function Viewfinder({ active, onPick, onSample }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const snap = useRef<HTMLCanvasElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<MediaStreamTrack | null>(null);
  const [focus, setFocus] = useState<{ x: number; y: number; k: number } | null>(null);
  const [status, setStatus] = useState<'starting' | 'live' | 'blocked'>(() => ('getUserMedia' in (navigator.mediaDevices ?? {}) ? 'starting' : 'blocked'));
  const [choice, setChoice] = useState<Choice>(savedChoice);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [current, setCurrent] = useState<{ deviceId?: string; facing: Facing }>({ facing: null });
  const [range, setRange] = useState<ZoomRange>({ min: 1, max: 4, step: 0.01, hardware: false });
  const [zoom, setZoom] = useState(1);
  const [switching, setSwitching] = useState(false);

  const digitalZoom = range.hardware ? 1 : zoom;
  const zoomRef = useRef(1);
  const digitalRef = useRef(1);
  digitalRef.current = digitalZoom;
  // What you see is what you get: the shot is the part of the frame that is visible in the preview.
  const visibleRect = useCallback((): Rect | null => {
    const v = video.current, b = box.current;
    if (!v?.videoWidth || !b) return null;
    const { s, dx, dy } = coverLayout(v.videoWidth, v.videoHeight, b.clientWidth, b.clientHeight, digitalRef.current);
    const sx = clamp(-dx / s, 0, v.videoWidth), sy = clamp(-dy / s, 0, v.videoHeight);
    return { sx, sy, sw: Math.min(v.videoWidth - sx, b.clientWidth / s), sh: Math.min(v.videoHeight - sy, b.clientHeight / s) };
  }, []);
  useImperativeHandle(ref, () => ({ video: video.current, live: status === 'live', blocked: status === 'blocked', visibleRect }), [status, visibleRect]);

  // Switching cameras: freeze the last frame (as the preview showed it), flip or blur it away, and bring the new camera in.
  const swap = useRef<{ kind: Swap; out: Promise<unknown> } | null>(null);
  function freeze(kind: Swap | 'still') {
    const v = video.current, c = snap.current, b = box.current;
    if (!v?.videoWidth || !c || !b) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(b.clientWidth * dpr);
    c.height = Math.round(b.clientHeight * dpr);
    const ctx = c.getContext('2d')!;
    const { s, dx, dy } = coverLayout(v.videoWidth, v.videoHeight, c.width, c.height, digitalRef.current);
    ctx.save();
    if (current.facing === 'user') {
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, dx, dy, v.videoWidth * s, v.videoHeight * s);
    ctx.restore();
    c.style.visibility = 'visible';
    if (wrap.current) wrap.current.style.opacity = '0';
    if (kind === 'still') {
      swap.current = { kind: 'fade', out: Promise.resolve() };
      return;
    }
    const anim =
      kind === 'flip'
        ? animate(c, { rotateY: [0, 180], scale: [1, 0.92, 1], filter: ['blur(0px)', 'blur(14px)'] }, { duration: 0.42, ease: [0.45, 0, 0.25, 1] })
        : animate(c, { filter: ['blur(0px)', 'blur(20px)'], scale: [1, 1.03] }, { duration: 0.28, ease: 'easeOut' });
    swap.current = { kind, out: anim.then(() => {}) };
  }
  async function reveal() {
    const pending = swap.current;
    swap.current = null;
    const c = snap.current, w = wrap.current;
    if (!pending || !c || !w) {
      if (w) w.style.opacity = '1';
      return;
    }
    // The blurred frame stays up until the new camera has a picture, so there is never a black gap.
    await pending.out;
    w.style.opacity = '1';
    await Promise.all([
      animate(c, { opacity: [1, 0] }, { duration: 0.3, ease: 'easeOut' }),
      animate(w, { scale: [1.04, 1] }, { duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }),
    ]);
    c.style.visibility = 'hidden';
    c.style.opacity = '';
    c.style.transform = '';
    c.style.filter = '';
  }

  const freezeRef = useRef(freeze);
  useEffect(() => {
    freezeRef.current = freeze;
  });

  useEffect(() => {
    if (!active) return;
    if (!('getUserMedia' in (navigator.mediaDevices ?? {}))) return;
    const v = video.current;
    let stream: MediaStream | null = null;
    let cancelled = false;
    const start = (c: Choice): Promise<MediaStream> =>
      navigator.mediaDevices.getUserMedia({ video: constraintsFor(c), audio: false }).catch((e) => {
        // A remembered camera can disappear (unplugged webcam); fall back to the default back camera.
        if ('deviceId' in c) return navigator.mediaDevices.getUserMedia({ video: constraintsFor({ facing: 'environment' }), audio: false });
        throw e;
      });
    start(choice)
      .then(async (s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        const t = s.getVideoTracks()[0] ?? null;
        track.current = t;
        const settings = (t?.getSettings?.() ?? {}) as MediaTrackSettings;
        const list = await listCameras();
        if (cancelled) return;
        const cam = list.find((c) => c.id === settings.deviceId);
        const facing = (settings.facingMode as Facing) ?? cam?.facing ?? ('facing' in choice ? choice.facing : null);
        setCameras(list);
        setCurrent({ deviceId: settings.deviceId, facing });
        const r = zoomRange(t);
        setRange(r);
        setZoom(r.hardware ? clamp((settings as { zoom?: number }).zoom ?? 1, r.min, r.max) : 1);
        zoomRef.current = r.hardware ? clamp((settings as { zoom?: number }).zoom ?? 1, r.min, r.max) : 1;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => {});
          await firstFrame(video.current);
        }
        if (cancelled) return;
        setStatus('live');
        setSwitching(false);
        void reveal();
      })
      .catch(() => {
        if (cancelled) return;
        setSwitching(false);
        void reveal();
        setStatus('blocked');
      });
    return () => {
      cancelled = true;
      track.current = null;
      // Paused (a sheet or the zukan on top): the last frame stays as a still until the camera is back, and the video lets
      // go of the stream entirely, so no WebView keeps the camera (and its indicator) on.
      if (!swap.current) freezeRef.current('still');
      stream?.getTracks().forEach((t) => t.stop());
      if (v) {
        v.pause();
        v.srcObject = null;
      }
    };
  }, [active, choice]);

  const currentCam = cameras.find((c) => c.id === current.deviceId);
  const onUltraWide = !!currentCam?.ultraWide;
  const ultraWideCam = current.facing !== 'user' ? cameras.find((c) => c.ultraWide && c.facing !== 'user') : undefined;
  // On the ultra-wide lens the picture is "0.5×" of the main camera, so labels are scaled to match.
  const base = onUltraWide && !range.hardware ? 0.5 : 1;
  const shown = zoom * base;
  const presets = zoomPresets(range, !!ultraWideCam || onUltraWide);
  const canFlip = !!nextChoice(cameras, current);
  const mirrored = current.facing === 'user';

  const raf = useRef(0);
  const lastStep = useRef(1);
  const setZoomTo = useCallback(
    (z: number, quiet = false) => {
      const next = clamp(z, range.min, range.max);
      zoomRef.current = next;
      setZoom(next);
      // A light tick when a pinch passes 1×, 2×, 3×… (or hits either end), like the native camera apps.
      const step = next <= range.min || next >= range.max ? -next : Math.floor(next);
      if (step !== lastStep.current) {
        if (!quiet) haptic('select');
        lastStep.current = step;
      }
      if (range.hardware && track.current) {
        cancelAnimationFrame(raf.current);
        const t = track.current;
        raf.current = requestAnimationFrame(() => void applyHardwareZoom(t, next));
      }
    },
    [range],
  );

  // Preset taps glide to the new zoom instead of jumping, like the system camera.
  const glide = useRef<AnimationPlaybackControls | null>(null);
  function glideTo(target: number) {
    glide.current?.stop();
    glide.current = animate(zoomRef.current, clamp(target, range.min, range.max), {
      duration: 0.35,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (z) => setZoomTo(z, true),
    });
  }

  function pickPreset(p: number) {
    haptic('select');
    if (p === 0.5 && ultraWideCam && !range.hardware) return switchTo({ deviceId: ultraWideCam.id }, false, 'fade');
    if (p >= 1 && onUltraWide) return switchTo({ facing: 'environment' }, false, 'fade');
    glideTo(p / base);
  }

  function switchTo(c: Choice, announce: boolean, kind: Swap) {
    glide.current?.stop();
    freeze(kind);
    setSwitching(true);
    setChoice(c);
    saveChoice(c);
    if (announce && 'deviceId' in c) {
      const label = cameras.find((x) => x.id === c.deviceId)?.label;
      if (label) toast(`${label} に切り替えました`, 'cameraswitch');
    }
  }

  function flip() {
    const c = nextChoice(cameras, current);
    if (!c) return;
    haptic('tap');
    switchTo(c, true, 'facing' in c ? 'flip' : 'fade');
  }

  // Pinch with two fingers (touch) and pinch on a trackpad (ctrl + wheel) both change the zoom.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const gestured = useRef(false);
  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (status !== 'live' || e.target !== video.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) gestured.current = false;
    if (pointers.current.size === 2) {
      glide.current?.stop();
      pinch.current = { d: distance(), z: zoomRef.current };
      gestured.current = true;
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) setZoomTo(pinch.current.z * (distance() / pinch.current.d));
  };
  const endPointer = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (status !== 'live' || !e.ctrlKey) return;
    glide.current?.stop();
    setZoomTo(zoomRef.current * Math.exp(-e.deltaY / 200));
  };

  // Stop the browser from zooming the page while pinching the preview (React's wheel listener is passive).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const stop = (e: Event) => {
      if ((e as globalThis.WheelEvent).ctrlKey || e.type === 'gesturestart') e.preventDefault();
    };
    el.addEventListener('wheel', stop, { passive: false });
    el.addEventListener('gesturestart', stop);
    return () => {
      el.removeEventListener('wheel', stop);
      el.removeEventListener('gesturestart', stop);
    };
  }, []);

  const onTap = (e: PointerEvent<HTMLDivElement>) => {
    const wasGesture = gestured.current;
    endPointer(e);
    const v = video.current;
    if (wasGesture || status !== 'live' || !v || e.target !== v) return;
    const r = box.current!.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    setFocus({ x: px, y: py, k: e.timeStamp });
    haptic('select');
    // Undo the on-screen zoom (scaled around the centre) and the front-camera mirror, then map through the object-cover crop.
    let ux = r.width / 2 + (px - r.width / 2) / digitalZoom;
    const uy = r.height / 2 + (py - r.height / 2) / digitalZoom;
    if (mirrored) ux = r.width - ux;
    const s = Math.max(r.width / (v.videoWidth || r.width), r.height / (v.videoHeight || r.height));
    const dw = (v.videoWidth || r.width) * s, dh = (v.videoHeight || r.height) * s;
    const x = (ux - (r.width - dw) / 2) / dw, y = (uy - (r.height - dh) / 2) / dh;
    if (track.current) void focusAt(track.current, clamp(x, 0, 1), clamp(y, 0, 1));
  };

  const live = status === 'live';
  // Only after a moment: when permission is already granted the camera starts before this would show.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active || status !== 'starting') return;
    const t = setTimeout(() => setSlow(true), 1200);
    return () => clearTimeout(t);
  }, [active, status]);
  const waiting = slow && active && status === 'starting';

  return (
    <div
      ref={box}
      className={`absolute inset-0 overflow-hidden bg-[#120e0b] [perspective:1400px] ${live ? 'touch-none' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onTap}
      onPointerCancel={endPointer}
      onWheel={onWheel}
    >
      <div ref={wrap} className="h-full w-full">
        <video
          ref={video}
          playsInline
          muted
          poster={BLANK_POSTER}
          className={`h-full w-full object-cover transition-opacity duration-500 ${live ? 'opacity-100' : 'opacity-0'}`}
          style={{ transform: `scale(${mirrored ? -digitalZoom : digitalZoom}, ${digitalZoom})` }}
        />
      </div>
      <canvas ref={snap} aria-hidden className="pointer-events-none invisible absolute inset-0 h-full w-full" />
      <AnimatePresence>
        {status === 'blocked' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="camera-fallback absolute inset-0 grid place-items-center overflow-y-auto px-8 pb-56 pt-48 text-center text-white/90"
          >
            <div className="max-w-sm">
              <motion.button
                aria-label="写真をえらぶ"
                onClick={onPick}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                className="camera-pick mx-auto mb-6 grid h-40 w-40 place-items-center rounded-[36px] border-2 border-dashed border-white/30 bg-white/5"
              >
                <Icon name="add_photo_alternate" size={56} />
              </motion.button>
              {/* Only when the camera can't be used: the photo picker first, and the sample photos as a way to try the app
                  without one. With a working camera the screen stays about taking photos (samples live in the tutorial). */}
              <p className="phrase-wrap text-[20px] font-black">
                <KidText text="カメラが使《つか》えないみたい" />
              </p>
              <p className="phrase-wrap mt-2 text-[14px] text-white/70">
                <KidText text="写真《しゃしん》をえらぶか、見本《みほん》の写真《しゃしん》でためしてみてね。" />
              </p>
              <p className="phrase-wrap mt-1 hidden text-[13px] text-white/55 lg:block">
                <KidText text={`画像《がぞう》をここにドロップしたり、${PASTE_KEY}で貼《は》り付《つ》けたりもできます。`} />
              </p>
              <p className="camera-sample-title mt-6 text-[13px] font-bold text-white/70">
                <KidText text="見本《みほん》の写真《しゃしん》" />
              </p>
              <div className="mt-2 flex justify-center gap-3">
                {SAMPLES.map((s, i) => (
                  <motion.button
                    key={s.src}
                    onClick={() => onSample(s.src)}
                    aria-label={stripRuby(s.label)}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: 0.2 + i * 0.07 } }}
                    whileHover={{ y: -4, rotate: i === 1 ? 0 : i === 0 ? -3 : 3 }}
                    whileTap={{ scale: 0.92 }}
                    className="camera-sample w-[96px] overflow-hidden whitespace-nowrap rounded-2xl border-2 border-white/20 bg-white/10 text-[11px] font-bold"
                  >
                    <img src={s.src} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
                    <span className="block py-1">
                      <KidText text={s.label} />
                    </span>
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {waiting && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-x-0 top-[38%] grid -translate-y-1/2 place-items-center px-8 text-center text-white"
          >
            <span className="grid h-16 w-16 place-items-center rounded-[22px] bg-white/10">
              <Icon name="photo_camera" size={34} fill />
            </span>
            <p className="phrase-wrap mt-4 text-[20px] font-black">
              <KidText text="カメラを許可《きょか》してね" />
            </p>
            <p className="phrase-wrap mt-1.5 max-w-xs text-[14px] leading-relaxed text-white/70">
              <KidText text="「許可《きょか》」をおすと、カメラで しらべられるよ。" />
            </p>
            {/* A PC may never answer the camera prompt (or have no camera); the other ways in are easy to miss there. */}
            <p className="phrase-wrap mt-4 hidden max-w-sm text-[13px] leading-relaxed text-white/55 lg:block">
              <Phrases text={`写真をここにドロップしたり、${PASTE_KEY}で貼り付けたりしても調べられます。`} />
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      {status === 'live' && <Reticle />}
      <AnimatePresence>
        {focus && status === 'live' && (
          <motion.span
            key={focus.k}
            aria-hidden
            className="pointer-events-none absolute h-[76px] w-[76px] rounded-[22px] border-2 border-[#ffd36b] shadow-[0_0_0_1px_rgb(0_0_0/0.15)]"
            style={{ left: focus.x - 38, top: focus.y - 38 }}
            initial={{ scale: 1.5, opacity: 0 }}
            animate={{ scale: [1.5, 1, 1.06, 1], opacity: [0, 1, 1, 0.9] }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            onAnimationComplete={() => setTimeout(() => setFocus((f) => (f?.k === focus.k ? null : f)), 900)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {live && (
          <CameraControls
            presets={presets}
            shown={shown}
            canFlip={canFlip}
            switching={switching}
            onPreset={pickPreset}
            onFlip={flip}
          />
        )}
      </AnimatePresence>
    </div>
  );
});

function CameraControls({ presets, shown, canFlip, switching, onPreset, onFlip }: {
  presets: number[]; shown: number; canFlip: boolean; switching: boolean; onPreset: (z: number) => void; onFlip: () => void;
}) {
  // The chip nearest below the current zoom shows the live value (e.g. "1.4×"), like a phone camera.
  const activeIndex = presets.reduce((best, p, i) => (shown >= p - 0.05 ? i : best), 0);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={spring}
      className="pointer-events-none absolute inset-x-0 z-10 flex items-center justify-center px-4 bottom-[calc(max(env(safe-area-inset-bottom),24px)+176px)] lg:bottom-[calc(24px+168px)]"
    >
      {presets.length > 1 && (
        <div role="group" aria-label="ズーム" className="glass pointer-events-auto flex items-center gap-1 rounded-full border border-white/15 bg-black/35 p-1 backdrop-blur-xl">
          {presets.map((p, i) => {
            const on = i === activeIndex;
            return (
              <motion.button
                key={p}
                onClick={(e) => {
                  e.stopPropagation();
                  onPreset(p);
                }}
                aria-label={`${formatZoom(p)}倍`}
                aria-pressed={on}
                whileTap={{ scale: 0.9 }}
                animate={{ width: on ? 54 : 44, height: 44 }}
                transition={spring}
                className={`grid place-items-center rounded-full text-[13px] font-black tabular-nums ${on ? 'bg-white/90 text-[#1f1a15]' : 'text-white/90'}`}
              >
                {on ? `${formatZoom(shown)}×` : formatZoom(p)}
              </motion.button>
            );
          })}
        </div>
      )}
      {canFlip && (
        <motion.button
          aria-label="カメラを切り替える"
          title="カメラを切り替える"
          onClick={(e) => {
            e.stopPropagation();
            onFlip();
          }}
          disabled={switching}
          whileTap={{ scale: 0.88, rotate: -90 }}
          transition={spring}
          className="glass pointer-events-auto absolute right-[calc(50%-min(160px,50vw-32px)+5px)] grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/35 text-white backdrop-blur-xl disabled:opacity-60"
        >
          <motion.span animate={{ rotate: switching ? 180 : 0 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }} className="grid">
            <Icon name="cameraswitch" size={24} />
          </motion.span>
        </motion.button>
      )}
    </motion.div>
  );
}

function Reticle() {
  const corner = 'absolute h-10 w-10 border-white/90';
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0, scale: 1.15 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 180, damping: 20, delay: 0.2 }}
      className="pointer-events-none absolute left-1/2 top-[44%] h-[min(62vw,340px)] w-[min(62vw,340px)] -translate-x-1/2 -translate-y-1/2"
    >
      <span className={`${corner} left-0 top-0 border-l-4 border-t-4 rounded-tl-3xl`} />
      <span className={`${corner} right-0 top-0 border-r-4 border-t-4 rounded-tr-3xl`} />
      <span className={`${corner} left-0 bottom-0 border-l-4 border-b-4 rounded-bl-3xl`} />
      <span className={`${corner} right-0 bottom-0 border-r-4 border-b-4 rounded-br-3xl`} />
    </motion.div>
  );
}

type FocusCaps = MediaTrackCapabilities & { focusMode?: string[]; pointsOfInterest?: unknown };

// Chrome on Android honours pointsOfInterest/focusMode; other engines ignore what they don't support.
async function focusAt(track: MediaStreamTrack, x: number, y: number) {
  const caps = (track.getCapabilities?.() ?? {}) as FocusCaps;
  const modes = caps.focusMode ?? [];
  const set: Record<string, unknown> = {};
  if ('pointsOfInterest' in caps) set.pointsOfInterest = [{ x, y }];
  if (set.pointsOfInterest && modes.includes('continuous')) set.focusMode = 'continuous';
  else if (modes.includes('single-shot')) set.focusMode = 'single-shot';
  else if (modes.includes('continuous')) set.focusMode = 'continuous';
  if (!Object.keys(set).length) return;
  try {
    await track.applyConstraints({ advanced: [set as MediaTrackConstraintSet] });
    if (set.focusMode === 'single-shot' && modes.includes('continuous')) {
      setTimeout(() => track.readyState === 'live' && track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {}), 4000);
    }
  } catch {
    // Unsupported constraint: the focus ring still gives feedback.
  }
}
