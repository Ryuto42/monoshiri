// Whether the device is offline right now. The native shells report it through the Network plugin (lib/native.ts),
// browsers through navigator.onLine; App.tsx feeds both in here.
let offline = typeof navigator !== 'undefined' && navigator.onLine === false;

export const isOffline = () => offline;

export function setOffline(v: boolean) {
  offline = v;
}
