// Keeps a sheet's form above the on-screen keyboard, in the app (Capacitor, where the web view does not resize
// for the keyboard: Keyboard.resize = 'none') and on the web (mobile browsers, where the keyboard only shrinks
// the visual viewport).
//
// A sheet opts in with data-kb-lift (wrapper, slid up through --kb-lift), data-kb-sheet, data-kb-scroll and
// data-kb-bottom (the submit button). When the keyboard opens it is moved once so the whole form, down to the
// submit button, sits above it: the sheet slides up (a transform) until its top would reach the status bar, and
// the rest is made up by scrolling its content (--kb-pad gives room to scroll). While the keyboard stays up,
// moving between fields changes nothing, so the user can type email → password → submit without anything
// jumping. Nothing changes size while it moves (the sheet's height is pinned), and both motions share one
// duration and curve.

const KB_MS = 300; // keep in sync with duration-300 on [data-kb-lift] in Account.tsx
const ease = (t: number) => 1 - (1 - t) ** 3; // = cubic-bezier(0.33,1,0.68,1)
const root = document.documentElement;
// Height of the layout viewport, which fixed sheets are laid out in (the keyboard does not change it).
const layoutHeight = () => root.clientHeight || window.innerHeight;

let probe: HTMLDivElement | null = null;
function safeTop() {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top)';
    document.body.append(probe);
  }
  return parseFloat(getComputedStyle(probe).paddingTop) || 0;
}

type Session = { wrap: HTMLElement; sheet: HTMLElement; sc: HTMLElement; base: number; kb: number };
let session: Session | null = null;
let anim = 0;
let padTimer: ReturnType<typeof setTimeout> | undefined;

function scrollTo(sc: HTMLElement, to: number) {
  cancelAnimationFrame(anim);
  const from = sc.scrollTop;
  if (Math.abs(to - from) < 1) return;
  const t0 = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / KB_MS);
    sc.scrollTop = from + (to - from) * ease(t);
    if (t < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}

// The lift actually on screen right now (it may be mid-transition).
const liftNow = (wrap: HTMLElement) => -new DOMMatrixReadOnly(getComputedStyle(wrap).transform).m42 || 0;

/** The keyboard is (now) `height` px tall, measured from the bottom of the layout viewport. */
export function keyboardShown(height: number) {
  const kb = Math.round(height);
  const el = document.activeElement;
  const wrap = el instanceof HTMLElement ? el.closest<HTMLElement>('[data-kb-lift]') : null;
  const sheet = wrap?.querySelector<HTMLElement>('[data-kb-sheet]');
  const sc = wrap?.querySelector<HTMLElement>('[data-kb-scroll]');
  if (!el || !wrap || !sheet || !sc) return;
  // Already in place. A slightly shorter keyboard (e.g. without the passwords bar) does not move anything either.
  if (session && session.wrap === wrap && kb <= session.kb + 1) return;
  clearTimeout(padTimer);
  cancelAnimationFrame(anim);
  const base = session?.wrap === wrap ? session.base : sc.scrollTop;
  session = { wrap, sheet, sc, base, kb };
  // Pin the sheet's height so the scroll room below (--kb-pad) neither grows it now nor shrinks it later.
  if (!sheet.style.height) sheet.style.height = `${sheet.offsetHeight}px`;
  root.style.setProperty('--kb-pad', `${kb}px`);
  // Positions with no lift and no scrolling of ours, measured from what is on screen now.
  const lifted = liftNow(wrap);
  const scrolled = sc.scrollTop - base;
  const field = (el.closest('label') ?? el).getBoundingClientRect();
  const end = wrap.querySelector('[data-kb-bottom]');
  const bottom = (end ? end.getBoundingClientRect().bottom : field.bottom) + lifted + scrolled;
  const sheetTop = sheet.getBoundingClientRect().top + lifted;
  const visible = layoutHeight() - kb;
  const need = Math.max(0, Math.round(bottom + 20 - visible));
  const lift = Math.min(need, Math.max(0, Math.floor(sheetTop - safeTop() - 8)));
  // When the whole form does not fit above the keyboard, stop scrolling before the focused field's label
  // goes under the top of the scroll area, but always keep the field itself above the keyboard.
  const labelRoom = Math.floor(field.top + lifted + scrolled - (sc.getBoundingClientRect().top + lifted) - 12);
  const fieldNeed = Math.ceil(field.bottom + lifted + scrolled + 20 - visible) - lift;
  const extra = Math.max(0, Math.min(need - lift, labelRoom), fieldNeed);
  root.style.setProperty('--kb-lift', `${lift}px`);
  scrollTo(sc, base + extra);
}

/** The keyboard is going away: move everything back. */
export function keyboardHidden() {
  if (!session) return;
  const { sc, sheet, base } = session;
  session = null;
  root.style.setProperty('--kb-lift', '0px');
  scrollTo(sc, base);
  clearTimeout(padTimer);
  padTimer = setTimeout(() => {
    root.style.setProperty('--kb-pad', '0px');
    sheet.style.height = '';
  }, KB_MS + 50);
}

/** A text field inside the lifted sheet still has focus (e.g. the user moved from email to password). */
export function typingInSheet() {
  const el = document.activeElement;
  return el instanceof HTMLInputElement && !!session && session.wrap.contains(el);
}

/** Mobile browsers: the keyboard shrinks the visual viewport; there is no keyboard event. */
export function setupWebKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  let frame = 0;
  const check = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const el = document.activeElement;
      const inSheet = el instanceof HTMLInputElement && !!el.closest('[data-kb-lift]');
      const kb = layoutHeight() - vv.height;
      // Ignore pinch zoom, and anything too small to be a keyboard.
      if (inSheet && Math.abs(vv.scale - 1) < 0.01 && kb > 120) {
        // Safari pans the page to show the field; the sheet does that itself, so undo the pan.
        if (vv.offsetTop > 0 || window.scrollY > 0) window.scrollTo(0, 0);
        keyboardShown(kb);
      } else if (!inSheet || kb < 60) {
        keyboardHidden();
      }
    });
  };
  vv.addEventListener('resize', check);
  document.addEventListener('focusout', () => setTimeout(check, 0));
  // While the keyboard is up, Safari scrolls the page to centre whichever field is tapped next, which shifts the
  // whole sheet. Take that tap over and focus the field without scrolling: the form is already in view.
  document.addEventListener(
    'touchend',
    (e) => {
      if (!session) return;
      const field = e.target instanceof Element ? e.target.closest('input') : null;
      if (!field || field === document.activeElement || !session.wrap.contains(field)) return;
      e.preventDefault();
      field.focus({ preventScroll: true });
    },
    { passive: false },
  );
  // Fallback for any other pan while the sheet is lifted.
  window.addEventListener('scroll', () => session && window.scrollY !== 0 && window.scrollTo(0, 0));
}
