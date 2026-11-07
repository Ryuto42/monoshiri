import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { platform, isNative } from './native';

type TapId = 'gallery' | 'shutter' | 'zukan' | 'close';

interface GlassChromePlugin {
  isAvailable(): Promise<{ liquidGlass: boolean }>;
  setCameraControls(o: { visible: boolean; count: number }): Promise<void>;
  setCloseButton(o: { visible: boolean }): Promise<void>;
  pickPhoto(): Promise<{ data?: string; mimeType?: string; cancelled?: boolean }>;
  addListener(event: 'tap', cb: (e: { id: TapId }) => void): Promise<PluginListenerHandle>;
}

// Implemented in ios/App/App/GlassChrome.swift: camera controls rendered as native Liquid Glass buttons over the web view.
export const GlassChrome = registerPlugin<GlassChromePlugin>('GlassChrome');

export const nativeChrome = isNative && platform === 'ios';

export async function pickNativePhoto(): Promise<Blob | null> {
  const r = await GlassChrome.pickPhoto();
  if (!r.data) return null;
  const bin = atob(r.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: r.mimeType ?? 'image/jpeg' });
}
