import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const buildId = (process.env.ANILIFE_BUILD_ID || process.env.GITHUB_SHA?.slice(0, 12) || Date.now().toString(36))
    .replace(/[^A-Za-z0-9._-]/g, '-');
  return {
    define: {
      __ANILIFE_BUILD_ID__: JSON.stringify(buildId),
    },
    plugins: [
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        // `npm run dev` (Vite) + `npm run dev:worker` (Wrangler) on 8787.
        '/api': {
          target: 'http://127.0.0.1:8787',
          changeOrigin: false,
        },
      },
    },
  };
});
