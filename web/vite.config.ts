import babel from '@rolldown/plugin-babel'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

const native = process.env.VITE_TARGET === 'native'

// Web only: Japanese webfont from Google Fonts (split by unicode-range, cached across sites). Native bundles it instead.
const webFonts = (): Plugin => ({
  name: 'monoshiri-web-fonts',
  transformIndexHtml: () =>
    native
      ? []
      : [
          { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }, injectTo: 'head' },
          {
            tag: 'link',
            attrs: { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;500;700;900&display=swap' },
            injectTo: 'head',
          },
        ],
})

// The icon font gets a content hash (so a new icon set is never served from an old cache); preload it under that name.
const iconFontPreload = (): Plugin => ({
  name: 'monoshiri-icon-font-preload',
  transformIndexHtml: {
    order: 'post',
    handler: (_html, ctx) => {
      const file = Object.keys(ctx.bundle ?? {}).find((f) => /material-symbols-rounded-[\w-]+\.woff2$/.test(f));
      return file ? [{ tag: 'link', attrs: { rel: 'preload', href: `/${file}`, as: 'font', type: 'font/woff2', crossorigin: '' }, injectTo: 'head' }] : [];
    },
  },
});

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss(), webFonts(), iconFontPreload()],
  build: {
    target: 'es2022',
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|@tanstack)/ },
            { name: 'motion', test: /node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)/ },
          ],
        },
      },
    },
  },
})
