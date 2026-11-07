import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'jp.monoshiri.app',
  appName: 'モノシリ',
  webDir: 'dist',
  backgroundColor: '#120e0b',
  android: {
    backgroundColor: '#120e0b',
    allowMixedContent: false,
  },
  ios: {
    backgroundColor: '#120e0b',
    contentInset: 'never',
    scrollEnabled: false,
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#120e0b',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: { overlaysWebView: true, style: 'DARK', backgroundColor: '#00000000' },
    Keyboard: { resize: 'none' },
  },
};

export default config;
