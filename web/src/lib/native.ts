import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform() as 'web' | 'ios' | 'android';

type Layer = { close: () => void; history: boolean };
const stack: Layer[] = [];

// On the web, in-memory layers (explore sheet, topic panel) own a history entry so the browser back button and
// swipe-back unwind them one at a time like the app does. Pushes and pops are reconciled in a microtask so
// mount/unmount pairs (StrictMode, switching topics) don't churn history.
let owned = 0;
let ignorePops = 0;
let scheduled = false;

function syncHistory() {
  scheduled = false;
  const want = stack.filter((l) => l.history).length;
  while (owned < want) {
    history.pushState({ ...history.state, layer: owned + 1 }, '');
    owned++;
  }
  if (owned > want) {
    const n = owned - want;
    owned = want;
    ignorePops++;
    history.go(-n);
  }
}

function schedule() {
  if (isNative || scheduled) return;
  scheduled = true;
  queueMicrotask(syncHistory);
}

if (!isNative) {
  window.addEventListener('popstate', () => {
    if (ignorePops) {
      ignorePops--;
      return;
    }
    const top = stack[stack.length - 1];
    if (!top?.history || owned === 0) return;
    owned--;
    stack.pop();
    top.close();
  });
}

// Screens register a close action so the Android back button, Escape and browser back unwind the UI one layer at a time.
// Route screens (zukan, card detail) pass history:false because the router already owns their entries.
export function onBack(handler: () => void, opts: { history?: boolean } = {}) {
  const layer: Layer = { close: handler, history: opts.history ?? true };
  stack.push(layer);
  schedule();
  return () => {
    const i = stack.lastIndexOf(layer);
    if (i < 0) return;
    stack.splice(i, 1);
    schedule();
  };
}

export function goBack(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  if (!isNative && top.history && owned > 0) history.back();
  else top.close();
  return true;
}

export async function haptic(kind: 'tap' | 'select' | 'success' | 'error' = 'tap') {
  if (!isNative) {
    if (kind !== 'select') navigator.vibrate?.(kind === 'error' ? [20, 40, 20] : 10);
    return;
  }
  const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
  if (kind === 'tap') return Haptics.impact({ style: ImpactStyle.Medium });
  if (kind === 'select') return Haptics.selectionChanged();
  return Haptics.notification({ type: kind === 'success' ? NotificationType.Success : NotificationType.Error });
}

// Light text over the camera; dark text over the paper-coloured collection in light mode.
export async function setStatusBar(onPaper: boolean) {
  if (!isNative) return;
  const { StatusBar, Style } = await import('@capacitor/status-bar');
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  StatusBar.setStyle({ style: onPaper && !dark ? Style.Light : Style.Dark }).catch(() => {});
}

export async function openExternal(url: string) {
  if (!isNative) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url, presentationStyle: 'popover', toolbarColor: '#120e0b' });
}

export async function setupNative(onOffline: (offline: boolean) => void) {
  const root = document.documentElement;
  root.classList.add(`platform-${platform}`);
  if (!isNative) return;
  root.classList.add('native');

  const [{ App }, { StatusBar, Style }, { SplashScreen }, { Network }, { Keyboard }] = await Promise.all([
    import('@capacitor/app'),
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen'),
    import('@capacitor/network'),
    import('@capacitor/keyboard'),
  ]);

  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  if (platform === 'android') StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
  requestAnimationFrame(() => SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {}));

  App.addListener('backButton', () => {
    if (!goBack()) App.minimizeApp();
  });

  Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});

  // The web view does not resize for the keyboard (Keyboard.resize = 'none'). A sheet that opts in
  // (data-kb-lift wrapper, data-kb-sheet, data-kb-scroll, data-kb-bottom) is moved once when the keyboard opens so
  // the whole form, down to [data-kb-bottom] (the submit button), sits above it: the sheet slides up (--kb-lift, a
  // transform) until its top would reach the status bar, and the rest is made up by scrolling its content (--kb-pad
  // gives room to scroll). While the keyboard stays up, moving between fields changes nothing, so the user can type
  // email → password → submit without anything jumping. Nothing changes size, so there is no layout work while it
  // moves, and both motions share one duration and curve.
  const KB_MS = 300; // keep in sync with duration-300 on [data-kb-lift] in Account.tsx
  const ease = (t: number) => 1 - (1 - t) ** 3; // = cubic-bezier(0.33,1,0.68,1)
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top)';
  document.body.append(probe);
  const safeTop = () => parseFloat(getComputedStyle(probe).paddingTop) || 0;
  type Session = { wrap: HTMLElement; sheet: HTMLElement; sc: HTMLElement; base: number; kb: number };
  let session: Session | null = null;
  let anim = 0;
  let padTimer: ReturnType<typeof setTimeout> | undefined;
  const scrollTo = (sc: HTMLElement, to: number) => {
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
  };
  // The lift actually on screen right now (it may be mid-transition).
  const liftNow = (wrap: HTMLElement) => -new DOMMatrixReadOnly(getComputedStyle(wrap).transform).m42 || 0;
  const open = (kb: number) => {
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
    const end = wrap.querySelector('[data-kb-bottom]') ?? el.closest('label') ?? el;
    const bottom = end.getBoundingClientRect().bottom + lifted + scrolled;
    const sheetTop = sheet.getBoundingClientRect().top + lifted;
    const need = Math.max(0, Math.round(bottom + 20 - (window.innerHeight - kb)));
    const lift = Math.min(need, Math.max(0, Math.floor(sheetTop - safeTop() - 8)));
    root.style.setProperty('--kb-lift', `${lift}px`);
    scrollTo(sc, base + need - lift);
  };
  const close = () => {
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
  };
  const typing = () => {
    const el = document.activeElement;
    return el instanceof HTMLInputElement && !!session && session.wrap.contains(el);
  };
  Keyboard.addListener('keyboardWillShow', (info) => open(Math.round(info.keyboardHeight)));
  // Moving between fields can report hide→show; while a field in the sheet still has focus, stay put.
  Keyboard.addListener('keyboardWillHide', () => !typing() && close());
  Keyboard.addListener('keyboardDidHide', () => !typing() && close());

  const status = await Network.getStatus();
  onOffline(!status.connected);
  Network.addListener('networkStatusChange', (s) => onOffline(!s.connected));

  // Keep users inside the app: external links (search chips, sources, YouTube, Wikipedia) open in the in-app browser.
  document.addEventListener(
    'click',
    (e) => {
      const a = e.composedPath().find((n): n is HTMLAnchorElement => n instanceof HTMLAnchorElement && !!n.href);
      if (!a || a.origin === location.origin) return;
      e.preventDefault();
      openExternal(a.href);
    },
    true,
  );
}
