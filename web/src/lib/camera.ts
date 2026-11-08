export type Facing = 'user' | 'environment' | null;
export type Camera = { id: string; label: string; facing: Facing; ultraWide: boolean };
export type Choice = { facing: 'user' | 'environment' } | { deviceId: string };

const FRONT = /front|user|facetime|前面|インカメ/i;
const BACK = /back|rear|environment|背面|外側/i;
const ULTRA_WIDE = /ultra ?wide|超広角/i;

// Labels are only filled in after camera permission is granted, so call this once a stream is running.
export async function listCameras(): Promise<Camera[]> {
  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  return devices
    .filter((d) => d.kind === 'videoinput' && d.deviceId)
    .map((d) => {
      const caps = (d as InputDeviceInfo).getCapabilities?.() as (MediaTrackCapabilities & { facingMode?: string[] }) | undefined;
      const fm = caps?.facingMode?.[0];
      const facing: Facing = fm === 'user' || fm === 'environment' ? fm : FRONT.test(d.label) ? 'user' : BACK.test(d.label) ? 'environment' : null;
      return { id: d.deviceId, label: d.label, facing, ultraWide: ULTRA_WIDE.test(d.label) };
    });
}

export function constraintsFor(choice: Choice): MediaTrackConstraints {
  const size = { width: { ideal: 1920 }, height: { ideal: 1080 } };
  return 'deviceId' in choice ? { deviceId: { exact: choice.deviceId }, ...size } : { facingMode: { ideal: choice.facing }, ...size };
}

const KEY = 'monoshiri.camera';

export function savedChoice(): Choice {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && (v.facing === 'user' || v.facing === 'environment' || typeof v.deviceId === 'string')) return v;
  } catch {
    /* storage unavailable */
  }
  return { facing: 'environment' };
}

export function saveChoice(choice: Choice) {
  try {
    localStorage.setItem(KEY, JSON.stringify(choice));
  } catch {
    /* storage unavailable */
  }
}

// Phones list several back lenses; flipping between front and back is what people expect there.
// Without a front/back split (e.g. a desktop with two webcams), step through the devices instead.
export function nextChoice(cameras: Camera[], current: { deviceId?: string; facing: Facing }): Choice | null {
  const hasFront = cameras.some((c) => c.facing === 'user');
  const hasBack = cameras.some((c) => c.facing === 'environment');
  if (hasFront && hasBack) return { facing: current.facing === 'user' ? 'environment' : 'user' };
  if (cameras.length < 2) return null;
  const i = cameras.findIndex((c) => c.id === current.deviceId);
  return { deviceId: cameras[(i + 1) % cameras.length].id };
}

export type ZoomRange = { min: number; max: number; step: number; hardware: boolean };

const DIGITAL_MAX = 4;

export function zoomRange(track: MediaStreamTrack | null): ZoomRange {
  const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { zoom?: { min: number; max: number; step?: number } };
  const z = caps.zoom;
  if (z && z.max > z.min) return { min: z.min, max: z.max, step: z.step || 0.1, hardware: true };
  return { min: 1, max: DIGITAL_MAX, step: 0.01, hardware: false };
}

export async function applyHardwareZoom(track: MediaStreamTrack, zoom: number) {
  try {
    await track.applyConstraints({ advanced: [{ zoom } as MediaTrackConstraintSet] });
  } catch {
    /* the device refused this value; the next gesture will try again */
  }
}

// Preset chips like a phone camera: the wide end (iPhone's ultra-wide lens as 0.5, or an Android
// logical camera whose zoom starts below 1, e.g. 0.6), then 1×, 2× and the largest whole step that fits.
export function zoomPresets(range: ZoomRange, ultraWide: boolean): number[] {
  const out: number[] = [];
  if (range.hardware && range.min < 0.95) out.push(Math.round(range.min * 10) / 10);
  else if (ultraWide) out.push(0.5);
  out.push(Math.max(1, range.min));
  if (range.max >= 2) out.push(2);
  const top = Math.min(10, Math.floor(range.max));
  if (top > 2) out.push(top >= 5 ? 5 : top);
  return [...new Set(out)];
}

export const formatZoom = (z: number) => (z < 1 ? z.toFixed(1).replace(/^0/, '') : Number.isInteger(Math.round(z * 10) / 10) ? String(Math.round(z)) : z.toFixed(1));
