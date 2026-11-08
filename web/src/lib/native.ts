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

  // The web view does not resize for the keyboard (Keyboard.resize = 'none'). A screen that opts in with
  // data-kb-lift is slid up (--kb-lift, a GPU transform) only as far as the focused field needs to clear the
  // keyboard, so moving between fields that are both visible does not move anything.
  // Moving focus between fields can fire hide→show back to back; the short delay on hide keeps the screen still.
  let kb = 0;
  let lift = 0;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const setLift = (v: number) => {
    v = Math.max(0, Math.round(v));
    if (Math.abs(v - lift) < 2) return;
    lift = v;
    root.style.setProperty('--kb-lift', `${v}px`);
  };
  const reveal = () => {
    const el = document.activeElement;
    if (!kb || !(el instanceof HTMLElement) || !el.closest('[data-kb-lift]')) return setLift(0);
    // The whole field, plus room for the hints under it (password rules).
    const r = (el.closest('label') ?? el).getBoundingClientRect();
    const bottom = r.bottom + lift + 52; // position without the current lift
    const top = r.top + lift;
    // Enough to clear the keyboard, but never push the field under the status bar.
    setLift(Math.min(bottom - (window.innerHeight - kb), top - 64));
  };
  Keyboard.addListener('keyboardWillShow', (info) => {
    clearTimeout(hideTimer);
    kb = Math.round(info.keyboardHeight);
    reveal();
  });
  Keyboard.addListener('keyboardWillHide', () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      kb = 0;
      setLift(0);
    }, 40);
  });
  document.addEventListener('focusin', () => kb && reveal());

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
