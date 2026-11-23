import React, { useState } from 'react';
import { Cloud, Download, LogOut, RefreshCw, ShieldCheck, Trash2, Unplug } from 'lucide-react';
import { useApp } from '../context/AppContext';

const STATUS_COPY = {
  local_only: 'Local only',
  signed_in: 'Signed in · Cloud Sync off',
  syncing: 'Syncing',
  up_to_date: 'Up to date',
  pending: 'Offline changes pending',
  offline: 'Offline · changes stay on this device',
  conflict: 'Conflict needs attention',
  expired: 'Sign-in expired',
  error: 'Cloud Sync unavailable',
} as const;

export const CloudSyncPanel: React.FC = () => {
  const { cloudSync, activeProfile } = useApp();
  const [selectedProfile, setSelectedProfile] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const busy = cloudSync.status === 'syncing';

  const run = (action: () => Promise<void>) => {
    setActionError(null);
    void action().catch((error) => setActionError(error instanceof Error ? error.message : 'Action failed'));
  };

  return (
    <section className="rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.06] p-5 space-y-4" aria-labelledby="cloud-sync-title">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300">
            <Cloud className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h3 id="cloud-sync-title" className="text-sm font-bold text-white">Anilife Cloud Sync</h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              Optional cross-device backup for profiles, portable settings, library and progress.
              Profile PINs, player servers, credentials and diagnostics never upload.
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-black/30 px-2.5 py-1 text-[10px] font-bold text-emerald-200" role="status">
          {STATUS_COPY[cloudSync.status]}
        </span>
      </div>

      {!cloudSync.user ? (
        <div className="space-y-3 border-t border-white/10 pt-4">
          <p className="text-xs text-zinc-400">
            Cloud Sync is off by default. Sign in with Discord to review what is already in the cloud
            before choosing whether to merge anything. Watching never requires an account.
          </p>
          <button
            type="button"
            onClick={() => run(cloudSync.signIn)}
            className="min-h-11 rounded-xl bg-[var(--anilife-accent)] px-4 text-xs font-black text-black"
          >
            Sign in with Discord
          </button>
        </div>
      ) : (
        <div className="space-y-4 border-t border-white/10 pt-4">
          <div className="flex items-center justify-between gap-3 text-xs">
            <div>
              <div className="font-semibold text-white">{cloudSync.user.name}</div>
              <div className="text-zinc-500">{cloudSync.user.email ?? 'Verified Discord account'}</div>
            </div>
            <div className="text-right text-zinc-400">
              {cloudSync.pending > 0 && <div>{cloudSync.pending} pending</div>}
              {cloudSync.lastSyncedAt && <div>Updated {new Date(cloudSync.lastSyncedAt).toLocaleString()}</div>}
            </div>
          </div>

          {!cloudSync.enabled && !cloudSync.preview && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(cloudSync.previewCloud)}
              className="min-h-11 w-full rounded-xl bg-[var(--anilife-accent)] px-4 text-xs font-black text-black disabled:opacity-50"
            >
              Review and enable Cloud Sync
            </button>
          )}

          {cloudSync.preview && (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                Merge preview
              </div>
              <p className="text-xs text-zinc-400">
                Cloud has {cloudSync.preview.profiles.length} profile(s), {cloudSync.preview.watchlist} library row(s)
                and {cloudSync.preview.progress} progress row(s). Existing local rows win the first merge.
              </p>
              {cloudSync.preview.profiles.length > 0 && (
                <label className="block text-xs text-zinc-300">
                  Match <span className="font-semibold text-white">{activeProfile.name}</span> with an existing cloud profile
                  <select
                    value={selectedProfile}
                    onChange={(event) => setSelectedProfile(event.target.value)}
                    className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-white"
                  >
                    <option value="">Keep cloud profiles separate</option>
                    {cloudSync.preview.profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>{profile.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                onClick={() => run(() => cloudSync.enableCloud(selectedProfile || undefined))}
                className="min-h-11 w-full rounded-xl bg-[var(--anilife-accent)] px-4 text-xs font-black text-black"
              >
                Merge safely and enable
              </button>
            </div>
          )}

          {cloudSync.enabled && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={busy} onClick={() => run(cloudSync.syncNow)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--anilife-accent)] px-3 text-xs font-black text-black disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" /> Sync now
              </button>
              <button type="button" onClick={() => run(cloudSync.exportData)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-white">
                <Download className="h-4 w-4" aria-hidden="true" /> Export cloud data
              </button>
              <button type="button" onClick={() => run(cloudSync.disconnect)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-white">
                <Unplug className="h-4 w-4" aria-hidden="true" /> Disconnect
              </button>
              <button type="button" onClick={() => run(cloudSync.signOut)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-white">
                <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out & revoke
              </button>
            </div>
          )}

          {cloudSync.status === 'expired' && (
            <button type="button" onClick={() => run(cloudSync.signIn)} className="min-h-11 w-full rounded-xl bg-[var(--anilife-accent)] px-4 text-xs font-black text-black">
              Sign in again
            </button>
          )}

          {cloudSync.status === 'conflict' && cloudSync.conflicts > 0 && (
            <div className="space-y-2 rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-3 text-xs">
              <p className="text-amber-100">
                {cloudSync.conflicts} item conflict(s) need a choice. Neither version has been discarded.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => run(() => cloudSync.resolveConflicts('keep_local'))} className="min-h-10 rounded-xl bg-amber-300 px-2 font-bold text-black">
                  Keep this device
                </button>
                <button type="button" onClick={() => run(() => cloudSync.resolveConflicts('use_cloud'))} className="min-h-10 rounded-xl border border-white/10 bg-white/5 px-2 font-bold text-white">
                  Use cloud version
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              if (window.prompt('Delete all Anilife cloud data? Local data on this browser will stay. Type DELETE to continue.') === 'DELETE') {
                run(cloudSync.deleteAccount);
              }
            }}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-950/20 px-3 text-xs font-bold text-red-300"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete remote account data
          </button>
        </div>
      )}

      {(actionError || cloudSync.message) && (
        <p className="text-xs text-red-300" role="alert">{actionError ?? cloudSync.message}</p>
      )}
    </section>
  );
};
