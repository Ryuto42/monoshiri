import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';
import './styles.css';

// A tab opened before a deploy asks for chunks that the new release no longer has; reload once to pick up the new build.
window.addEventListener('vite:preloadError', (e) => {
  const key = 'monoshiri.reloadedAt';
  try {
    if (Date.now() - Number(sessionStorage.getItem(key) ?? 0) < 10_000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    return;
  }
  e.preventDefault();
  location.reload();
});

// Native builds bundle the font so it works offline; the web build pulls it from Google Fonts (see vite.config.ts).
if (import.meta.env.VITE_TARGET === 'native') void import('./fonts-native');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
