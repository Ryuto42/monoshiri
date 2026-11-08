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

  // The web view does not resize for the keyboard (Keyboard.resize = 'none'), so expose its height as --kb.
  // Screens that opt in with data-kb-lift / data-kb-sheet / data-kb-scroll move above the keyboard, and the
  // focused field is scrolled into view in the same motion (computed up front, not after the keyboard settles).
  // Moving focus between fields can fire hide→show back to back; the short delay on hide keeps the sheet still.
  let kb = 0;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let scrollAnim = 0;
  const KB_MS = 250; // keep in sync with the duration-[250ms] transitions in Account.tsx
  const ease = (t: number) => 1 - (1 - t) ** 3; // = cubic-bezier(0.33,1,0.68,1)
  const scrollTo = (el: HTMLElement, to: number) => {
    cancelAnimationFrame(scrollAnim);
    const from = el.scrollTop;
    if (Math.abs(to - from) < 1) return;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / KB_MS);
      el.scrollTop = from + (to - from) * ease(t);
      if (t < 1) scrollAnim = requestAnimationFrame(step);
    };
    scrollAnim = requestAnimationFrame(step);
  };
  const reveal = (nextKb: number) => {
    const el = document.activeElement;
    if (!nextKb || !(el instanceof HTMLElement) || !el.closest('[data-kb-lift]')) return;
    const sheet = el.closest<HTMLElement>('[data-kb-sheet]');
    const sc = el.closest<HTMLElement>('[data-kb-scroll]');
    if (!sheet || !sc) return;
    const target = el.closest('label') ?? el;
    const H = window.innerHeight;
    const sr = sheet.getBoundingClientRect();
    // Where the sheet will be once it has moved above the keyboard (max-height: 94dvh - kb).
    const natural = sheet.offsetHeight + (sc.scrollHeight - sc.clientHeight);
    const newH = Math.min(natural, H * 0.94 - nextKb);
    const shift = H - nextKb - newH - sr.top;
    const top = sc.getBoundingClientRect().top + shift;
    const bottom = H - nextKb;
    const tr = target.getBoundingClientRect();
    let d = 0;
    if (tr.bottom + shift + 56 > bottom) d = tr.bottom + shift + 56 - bottom; // room for the hints under the field
    else if (tr.top + shift - 16 < top) d = tr.top + shift - 16 - top;
    const max = sc.scrollHeight - (sc.clientHeight - (sheet.offsetHeight - newH));
    scrollTo(sc, Math.max(0, Math.min(max, sc.scrollTop + d)));
  };
  Keyboard.addListener('keyboardWillShow', (info) => {
    clearTimeout(hideTimer);
    const h = Math.round(info.keyboardHeight);
    reveal(h); // measure before --kb changes the layout
    if (h !== kb) {
      kb = h;
      root.style.setProperty('--kb', `${h}px`);
    }
  });
  Keyboard.addListener('keyboardWillHide', () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      kb = 0;
      root.style.setProperty('--kb', '0px');
    }, 40);
  });
  document.addEventListener('focusin', () => kb && reveal(kb));

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
