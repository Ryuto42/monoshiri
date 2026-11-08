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
  // (data-kb-lift wrapper, data-kb-sheet, data-kb-scroll, data-kb-bottom) keeps its form visible down to
  // [data-kb-bottom] above the keyboard: the sheet slides up (--kb-lift, a transform) until its top would reach
  // the status bar, and the rest is made up by scrolling its content (with --kb-pad as room to scroll).
  // Nothing changes size, so there is no layout work while it moves. Both motions share one duration and curve.
  // Moving focus between fields can fire hide→show back to back; the short delay on hide keeps the sheet still.
  const KB_MS = 300; // keep in sync with duration-300 on [data-kb-lift] in Account.tsx
  const ease = (t: number) => 1 - (1 - t) ** 3; // = cubic-bezier(0.33,1,0.68,1)
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top)';
  document.body.append(probe);
  const safeTop = () => parseFloat(getComputedStyle(probe).paddingTop) || 0;
  let kb = 0;
  let lift = 0;
  let extra = 0; // how far we scrolled the content ourselves
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let padTimer: ReturnType<typeof setTimeout> | undefined;
  let anim = 0;
  const scrollBy = (sc: HTMLElement, delta: number) => {
    cancelAnimationFrame(anim);
    if (Math.abs(delta) < 1) return;
    const from = sc.scrollTop;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / KB_MS);
      sc.scrollTop = from + delta * ease(t);
      if (t < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  };
  const apply = () => {
    const el = document.activeElement;
    const wrap = el instanceof HTMLElement ? el.closest<HTMLElement>('[data-kb-lift]') : null;
    const sheet = wrap?.querySelector<HTMLElement>('[data-kb-sheet]');
    const sc = wrap?.querySelector<HTMLElement>('[data-kb-scroll]');
    const sc0 = document.querySelector<HTMLElement>('[data-kb-scroll]');
    if (!kb || !el || !wrap || !sheet || !sc) {
      // Back to where things were.
      root.style.setProperty('--kb-lift', '0px');
      if (sc0 && extra) scrollBy(sc0, -extra);
      extra = 0;
      lift = 0;
      clearTimeout(padTimer);
      padTimer = setTimeout(() => root.style.setProperty('--kb-pad', '0px'), KB_MS + 50);
      return;
    }
    clearTimeout(padTimer);
    root.style.setProperty('--kb-pad', `${kb}px`);
    const end = wrap.querySelector('[data-kb-bottom]') ?? el.closest('label') ?? el;
    // Positions as they would be with no lift and no scrolling of ours.
    const bottom = end.getBoundingClientRect().bottom + lift + extra;
    const sheetTop = sheet.getBoundingClientRect().top + lift;
    const need = Math.max(0, Math.round(bottom + 24 - (window.innerHeight - kb)));
    const nextLift = Math.min(need, Math.max(0, Math.floor(sheetTop - safeTop() - 8)));
    const nextExtra = need - nextLift;
    if (Math.abs(nextLift - lift) >= 2) root.style.setProperty('--kb-lift', `${nextLift}px`);
    scrollBy(sc, nextExtra - extra);
    lift = nextLift;
    extra = nextExtra;
  };
  Keyboard.addListener('keyboardWillShow', (info) => {
    clearTimeout(hideTimer);
    kb = Math.round(info.keyboardHeight);
    apply();
  });
  Keyboard.addListener('keyboardWillHide', () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      kb = 0;
      apply();
    }, 40);
  });
  document.addEventListener('focusin', () => kb && apply());

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
