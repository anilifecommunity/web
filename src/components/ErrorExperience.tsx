import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Home, RefreshCw, Search } from 'lucide-react';
import { recordDiagnostic } from '../data/diagnostics';
import { errorPresentation, type AppErrorState } from '../utils/errorExperience';

interface Props {
  error: AppErrorState;
  onDismiss?: () => void;
}
export const ErrorExperience: React.FC<Props> = ({ error, onDismiss }) => {
  const copy = errorPresentation(error);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [remaining, setRemaining] = useState(Math.max(0, error.retryAfterSec ?? 0));

  useEffect(() => {
    headingRef.current?.focus();
  }, [error.code, error.status]);

  useEffect(() => {
    setRemaining(Math.max(0, error.retryAfterSec ?? 0));
    if (!error.retryAfterSec) return;
    const timer = window.setInterval(() => setRemaining((value) => {
      if (value <= 1) {
        window.clearInterval(timer);
        return 0;
      }
      return value - 1;
    }), 1_000);
    return () => window.clearInterval(timer);
  }, [error.retryAfterSec]);

  const accent = copy.tone === 'access'
    ? 'text-amber-300 border-amber-300/25 bg-amber-300/10'
    : copy.tone === 'waiting'
      ? 'text-sky-300 border-sky-300/25 bg-sky-300/10'
      : copy.tone === 'service'
        ? 'text-violet-300 border-violet-300/25 bg-violet-300/10'
        : 'text-[var(--anilife-accent)] border-[var(--anilife-accent)]/25 bg-[var(--anilife-accent)]/10';

  return (
    <div className="fixed inset-0 z-[220] flex min-h-dvh items-center justify-center overflow-y-auto bg-[#070708] p-4 text-white" role="alertdialog" aria-modal="true" aria-labelledby="anilife-error-title" aria-describedby="anilife-error-message">
      <div className="w-full max-w-2xl py-8 text-center">
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border ${accent}`}>
          <AlertTriangle aria-hidden="true" className="h-6 w-6" />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Error {error.status}</p>
        <h1 ref={headingRef} tabIndex={-1} id="anilife-error-title" className="mx-auto mt-3 max-w-xl text-3xl font-black tracking-tight sm:text-5xl">{copy.title}</h1>
        <p id="anilife-error-message" className="mx-auto mt-4 max-w-lg text-sm leading-7 text-zinc-400 sm:text-base">{copy.message}</p>
        {remaining > 0 && <p className="mt-3 text-sm text-zinc-500">Retry available in <span aria-hidden="true">{remaining} seconds</span><span className="sr-only">after the cooldown</span>.</p>}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {error.onRetry && <button type="button" disabled={remaining > 0} onClick={error.onRetry} className="anilife-button anilife-button-primary disabled:cursor-not-allowed disabled:opacity-40"><RefreshCw aria-hidden="true" className="h-4 w-4" /> Try again</button>}
          {onDismiss && <button type="button" onClick={onDismiss} className="anilife-button anilife-button-primary">{error.dismissLabel ?? 'Close'}</button>}
          {error.status === 404 && <a href="/discover" className="anilife-button anilife-button-secondary"><Search aria-hidden="true" className="h-4 w-4" /> Search anime</a>}
          <a href="/" className="anilife-button anilife-button-secondary"><Home aria-hidden="true" className="h-4 w-4" /> Back to home</a>
          <button type="button" onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign('/')} className="anilife-button anilife-button-secondary"><ArrowLeft aria-hidden="true" className="h-4 w-4" /> Go back</button>
        </div>
      </div>
    </div>
  );
};

interface BoundaryState {
  failed: boolean;
}

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(): void {
    recordDiagnostic('DIAG-01', { stage: 'react_error_boundary' });
  }

  render(): React.ReactNode {
    if (this.state.failed) {
      return <ErrorExperience error={{ status: 500, code: 'react_failure', onRetry: () => window.location.reload() }} />;
    }
    return this.props.children;
  }
}

