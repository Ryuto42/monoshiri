import { Capacitor } from '@capacitor/core';
import { keyboardHidden, keyboardShown, setupWebKeyboard, typingInSheet } from './keyboardLift';

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
  if (platform === 'android' || /Android/i.test(navigator.userAgent)) root.classList.add('no-blur');
  if (!isNative) {
    setupWebKeyboard();
    return;
  }
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
  // iOS: a swipe in from the left edge (MainViewController in ios/App/App/GlassChrome.swift). Nothing to close on the camera.
  if (platform === 'ios') window.addEventListener('edgeback', () => goBack());

  Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});

  // The web view does not resize for the keyboard (Keyboard.resize = 'none'); see lib/keyboardLift.ts.
  Keyboard.addListener('keyboardWillShow', (info) => keyboardShown(info.keyboardHeight));
  if (platform === 'android') Keyboard.addListener('keyboardDidShow', (info) => keyboardShown(info.keyboardHeight));
  const onHide = () => {
    // iOS can report hide→show when moving between fields; while a field in the sheet still has focus, stay put.
    if (platform === 'ios' && typingInSheet()) return;
    // Android: the back button closes the keyboard but leaves the field focused. Drop the focus too, so the next tap
    // on it brings the keyboard (and the lift) back.
    if (platform === 'android' && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    keyboardHidden();
  };
  Keyboard.addListener('keyboardWillHide', onHide);
  Keyboard.addListener('keyboardDidHide', onHide);

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
