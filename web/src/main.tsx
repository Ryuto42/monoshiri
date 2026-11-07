import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';
import './styles.css';

// Native builds bundle the font so it works offline; the web build pulls it from Google Fonts (see vite.config.ts).
if (import.meta.env.VITE_TARGET === 'native') void import('./fonts-native');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
