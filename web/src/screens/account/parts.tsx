import { AnimatePresence } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Me } from '../../lib/firebase';
import { Icon } from '../../components/ui';
import { PrivacySheet } from '../Privacy';

export function Avatar({ me, size = 72 }: { me: Me; size?: number }) {
  const [broken, setBroken] = useState(false);
  const initial = (me.name ?? me.email ?? '?').trim().charAt(0).toUpperCase();
  return me.photo && !broken ? (
    <img src={me.photo} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="rounded-full object-cover shadow-[var(--shadow-card)]" style={{ width: size, height: size }} />
  ) : (
    <span className="grid place-items-center rounded-full bg-accent font-black text-white shadow-[var(--shadow-card)]" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {initial}
    </span>
  );
}

export function Field({ icon, label, className = '', children }: { icon: string; label: string; className?: string; children: ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block px-1 text-[12px] font-bold text-ink-2">{label}</span>
      <span className="field flex h-13 items-center gap-2 rounded-2xl border border-line bg-paper px-3.5 transition-shadow focus-within:border-accent/60 focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_18%,transparent)]">
        <Icon name={icon} size={20} className="shrink-0 text-ink-3" />
        {children}
      </span>
    </label>
  );
}

export function Spinner({ light = false, big = false }: { light?: boolean; big?: boolean }) {
  const s = big ? 32 : 18;
  return (
    <span
      aria-label="読み込み中"
      className={`inline-block animate-spin rounded-full border-2 ${light ? 'border-white/40 border-t-white' : 'border-ink/15 border-t-ink/70'} ${big ? 'mx-auto my-16 block' : ''}`}
      style={{ width: s, height: s }}
    />
  );
}

// Google's brand mark, as their sign-in branding guidelines require next to "Google でつづける".
export function GoogleMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

// Opens the policy on top of the account sheet (not as a route), so a half-filled form stays as it was.
// Only the words are underlined: a trailing icon stays clear of the line, so it never looks broken at the gap.
export function PrivacyLink({ className = '', children = 'プライバシーポリシー', icon }: { className?: string; children?: ReactNode; icon?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`font-bold ${className}`}>
        <span className="underline decoration-current/30 underline-offset-4">{children}</span>
        {icon && <Icon name={icon} size={18} />}
      </button>
      {createPortal(<AnimatePresence>{open && <PrivacySheet key="privacy" onClose={() => setOpen(false)} />}</AnimatePresence>, document.body)}
    </>
  );
}
