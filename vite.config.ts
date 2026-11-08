import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'oauth-callback-rewrite',
        configureServer(server) {
          server.middlewares.use((req, _res, next) => {
            if (req.url && (req.url === '/auth/callback' || req.url.startsWith('/auth/callback?'))) {
              req.url = '/auth/callback/index.html';
            }
            next();
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
