import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import {
  hydrateLocalStorageFromIdb,
  migrateLocalStorageToIdb,
  requestPersistentStorage,
} from './data/idb';
import { recordDiagnostic } from './data/diagnostics';

/**
 * Restore a missing localStorage from IndexedDB before React reads it, then mirror the current
 * document back. A failure here must never stop the app from rendering: localStorage is still the
 * boot source, and the mirror is additive.
 */
async function bootstrap(): Promise<void> {
  try {
    const hydration = await hydrateLocalStorageFromIdb();
    if (hydration.restored.length > 0) {
      console.info(`[storage] restored ${hydration.restored.length} key(s) from IndexedDB`);
    }
    await migrateLocalStorageToIdb();
    void requestPersistentStorage();
  } catch (error) {
    console.warn('[storage] local store bootstrap failed', error);
    recordDiagnostic('DIAG-01', { stage: 'storage_bootstrap' });
  }

  createRoot(document.getElementById('root')!).render(<App />);

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          registrations.forEach((registration) => {
            const script =
              registration.active?.scriptURL ||
              registration.waiting?.scriptURL ||
              registration.installing?.scriptURL ||
              '';
            // Drop a worker left behind by an older deployment with a different script path.
            if (script && !script.includes('/sw.js')) {
              void registration.unregister();
            }
          })
        )
        .catch(() => undefined);

      navigator.serviceWorker
        .register('/sw.js?v=3', { updateViaCache: 'none' })
        .then((registration) => registration.update().catch(() => undefined))
        .catch((error) => {
          console.warn('[pwa] service worker registration failed', error);
        });
    });
  }
}

void bootstrap();
