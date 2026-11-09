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
    // Android: the keyboard neither resizes nor pans the web view, as on iOS (MainActivity also hides it from the
    // web view); lib/keyboardLift.ts moves the sheet itself. env(safe-area-inset-*) still works on WebView 140+.
    SystemBars: { insetsHandling: 'disable' },
    // Native Google sign-in; the other providers stay out of the app bundle.
    SocialLogin: { providers: { google: true, apple: false, facebook: false, twitter: false } },
  },
};

export default config;
