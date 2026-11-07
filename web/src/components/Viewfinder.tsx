import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from './ui';

export type ViewfinderHandle = { video: HTMLVideoElement | null; live: boolean };

const SAMPLES = [
  { src: '/samples/desk.webp', label: 'つくえの上' },
  { src: '/samples/park.webp', label: '秋の公園' },
  { src: '/samples/kitchen.webp', label: 'キッチン' },
];

export const Viewfinder = forwardRef<ViewfinderHandle, { active: boolean; onPick: () => void; onSample: (src: string) => void }>(function Viewfinder({ active, onPick, onSample }, ref) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'starting' | 'live' | 'blocked'>('starting');

  useImperativeHandle(ref, () => ({ video: video.current, live: status === 'live' }), [status]);

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    setStatus('starting');
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('blocked');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(async (s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => {});
        }
        setStatus('live');
      })
      .catch(() => !cancelled && setStatus('blocked'));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#120e0b]">
      <video ref={video} playsInline muted className={`h-full w-full object-cover transition-opacity duration-700 ${status === 'live' ? 'opacity-100' : 'opacity-0'}`} />
      <AnimatePresence>
        {status === 'blocked' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 grid place-items-center overflow-y-auto px-8 pb-56 pt-20 text-center text-white/90"
          >
            <div className="max-w-sm">
              <motion.button
                onClick={onPick}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                className="mx-auto mb-6 grid h-40 w-40 place-items-center rounded-[36px] border-2 border-dashed border-white/30 bg-white/5"
              >
                <Icon name="add_photo_alternate" size={56} />
              </motion.button>
              <p className="text-[20px] font-black">写真をえらんで、しらべよう</p>
              <p className="mt-2 text-[14px] text-white/60">
                カメラが使えないときは、写真をえらぶか、ここにドロップ・貼り付けできます。
              </p>
              <p className="mt-6 text-[13px] font-bold text-white/70">サンプルでためす</p>
              <div className="mt-2 flex justify-center gap-3">
                {SAMPLES.map((s, i) => (
                  <motion.button
                    key={s.src}
                    onClick={() => onSample(s.src)}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: 0.2 + i * 0.07 } }}
                    whileHover={{ y: -4, rotate: i === 1 ? 0 : i === 0 ? -3 : 3 }}
                    whileTap={{ scale: 0.92 }}
                    className="w-[96px] overflow-hidden whitespace-nowrap rounded-2xl border-2 border-white/20 bg-white/10 text-[11px] font-bold"
                  >
                    <img src={s.src} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
                    <span className="block py-1">{s.label}</span>
                  </motion.button>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-white/40">サンプル写真はAIで生成した画像です</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {status === 'live' && <Reticle />}
    </div>
  );
});

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
