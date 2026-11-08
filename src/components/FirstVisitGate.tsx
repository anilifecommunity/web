import React, { useEffect, useRef, useState } from 'react';
import { getGateStatus, verifyGateToken } from '../utils/workerApi';

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          theme?: 'dark' | 'light' | 'auto';
          callback: (token: string) => void;
          'error-callback'?: () => void;
          'expired-callback'?: () => void;
        }
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const SITE_KEY = String((import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ?? '').trim();
const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type Phase = 'checking' | 'needed' | 'verifying' | 'passed' | 'error';

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('turnstile script failed')));
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('turnstile script failed'));
    document.head.appendChild(script);
  });
}

/**
 * First-visit bot check. Nothing is rendered behind the gate until Cloudflare Turnstile has
 * verified the visitor, and the Worker sets an HttpOnly session cookie that `/api/resolve`
 * requires. If no site key is configured the gate steps aside (local development).
 */
export const FirstVisitGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [phase, setPhase] = useState<Phase>(SITE_KEY ? 'checking' : 'passed');
  const [message, setMessage] = useState('Checking your browser...');
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;

    getGateStatus().then((passed) => {
      if (cancelled) return;
      if (passed) {
        setPhase('passed');
      } else {
        setPhase('needed');
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (phase !== 'needed' || !widgetRef.current) return;
    let cancelled = false;

    loadTurnstile()
      .then(() => {
        if (cancelled || !window.turnstile || !widgetRef.current) return;
        if (widgetId.current) window.turnstile.remove(widgetId.current);
        widgetId.current = window.turnstile.render(widgetRef.current, {
          sitekey: SITE_KEY,
          theme: 'dark',
          callback: (token: string) => {
            setPhase('verifying');
            setMessage('Verifying...');
            verifyGateToken(token).then((ok) => {
              if (cancelled) return;
              if (ok) {
                setPhase('passed');
              } else {
                setPhase('error');
                setMessage('Verification failed. Please try again.');
              }
            });
          },
          'error-callback': () => {
            if (cancelled) return;
            setPhase('error');
            setMessage('The browser check could not run.');
          },
          'expired-callback': () => {
            if (cancelled) return;
            setPhase('needed');
            setMessage('The check expired. Please try again.');
          },
        });
      })
      .catch(() => {
        if (cancelled) return;
        setPhase('error');
        setMessage('The browser check could not load.');
      });

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [phase]);

  if (phase === 'passed') return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0e0d16] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#121216] p-7 text-center shadow-2xl">
        <img
          src="/assets/images/Anilife-Logo.png"
          alt="Anilife"
          className="mx-auto mb-5 h-14 w-14 rounded-xl object-contain"
        />
        <h1 className="text-lg font-bold text-white">Welcome to Anilife</h1>
        <p className="mt-2 text-sm text-zinc-400">{message}</p>

        <div ref={widgetRef} className="mt-6 flex min-h-[70px] items-center justify-center" />

        {phase === 'error' && (
          <button
            type="button"
            onClick={() => {
              setMessage('Checking your browser...');
              setPhase('needed');
            }}
            className="mt-4 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 transition-colors hover:border-[#74cf66] hover:text-white"
          >
            Try again
          </button>
        )}

        <p className="mt-6 text-[11px] leading-relaxed text-zinc-600">
          Protected by Cloudflare Turnstile. One check per day.
        </p>
      </div>
    </div>
  );
};

