import { useCallback, useEffect, useRef, useState } from 'react';
import {
  beginCloudSignIn,
  bootstrapCloud,
  CloudSyncError,
  deleteCloudAccount,
  emptyCloudState,
  exportCloudData,
  getCloudUser,
  loadCloudSnapshot,
  loadCloudState,
  pushPullCloud,
  revokeCloudDevice,
  retryDelayMs,
  saveCloudState,
  saveCloudSnapshot,
  signOutCloud,
  stageSnapshot,
  type BootstrapResult,
  type CloudAccountState,
  type CloudUser,
} from './client';
import { applyChangesToShadow, mergeRemoteChanges, type LocalCloudSnapshot } from './model';

export type CloudStatus =
  | 'local_only'
  | 'signed_in'
  | 'syncing'
  | 'up_to_date'
  | 'pending'
  | 'offline'
  | 'conflict'
  | 'expired'
  | 'error';

export interface CloudPreview {
  result: BootstrapResult;
  profiles: Array<{ id: string; name: string }>;
  watchlist: number;
  progress: number;
}

export interface CloudSyncController {
  user: CloudUser | null;
  enabled: boolean;
  status: CloudStatus;
  pending: number;
  lastSyncedAt: number | null;
  message: string | null;
  preview: CloudPreview | null;
  signIn: () => Promise<void>;
  previewCloud: () => Promise<void>;
  enableCloud: (selectedRemoteProfile?: string) => Promise<void>;
  syncNow: () => Promise<void>;
  disconnect: () => Promise<void>;
  signOut: () => Promise<void>;
  exportData: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  conflicts: number;
  resolveConflicts: (choice: 'keep_local' | 'use_cloud') => Promise<void>;
}

const LEASE_KEY = 'anilife_cloud_sync_lease_v1';

async function withSyncLock<T>(work: () => Promise<T>): Promise<T> {
  const locks = (navigator as Navigator & {
    locks?: { request<T>(name: string, options: { ifAvailable: boolean }, callback: (lock: unknown | null) => Promise<T>): Promise<T> };
  }).locks;
  if (locks) {
    return locks.request('anilife-cloud-sync', { ifAvailable: true }, async (lock) => {
      if (!lock) throw new CloudSyncError(409, 'sync_busy');
      return work();
    });
  }
  const owner = crypto.randomUUID();
  const now = Date.now();
  try {
    const current = JSON.parse(localStorage.getItem(LEASE_KEY) ?? 'null') as { owner?: string; expiresAt?: number } | null;
    if (current?.expiresAt && current.expiresAt > now) throw new CloudSyncError(409, 'sync_busy');
    localStorage.setItem(LEASE_KEY, JSON.stringify({ owner, expiresAt: now + 30_000 }));
    const written = JSON.parse(localStorage.getItem(LEASE_KEY) ?? 'null') as { owner?: string } | null;
    if (written?.owner !== owner) throw new CloudSyncError(409, 'sync_busy');
    return await work();
  } finally {
    try {
      const current = JSON.parse(localStorage.getItem(LEASE_KEY) ?? 'null') as { owner?: string } | null;
      if (current?.owner === owner) localStorage.removeItem(LEASE_KEY);
    } catch {}
  }
}

function preview(result: BootstrapResult): CloudPreview {
  const latest = new Map<string, (typeof result.changes)[number]>();
  for (const change of result.changes) {
    const key = `${change.profileId}\0${change.entityType}\0${change.entityKey}`;
    if ((latest.get(key)?.revision ?? 0) <= change.revision) latest.set(key, change);
  }
  return {
    result,
    profiles: [...latest.values()]
      .filter((change) => change.entityType === 'profile' && change.action === 'upsert')
      .map((change) => ({ id: change.profileId, name: String(change.value?.name ?? 'Cloud profile') })),
    watchlist: [...latest.values()].filter((change) => change.entityType === 'watchlist' && change.action === 'upsert').length,
    progress: [...latest.values()].filter((change) => change.entityType === 'continue_progress' && change.action === 'upsert').length,
  };
}

function downloadJson(value: unknown, filename: string): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function useCloudSync(
  snapshot: LocalCloudSnapshot,
  applySnapshot: (next: LocalCloudSnapshot) => void,
): CloudSyncController {
  const [user, setUser] = useState<CloudUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [accountState, setAccountState] = useState<CloudAccountState>(emptyCloudState);
  const [status, setStatus] = useState<CloudStatus>('local_only');
  const [message, setMessage] = useState<string | null>(null);
  const [cloudPreview, setCloudPreview] = useState<CloudPreview | null>(null);
  const [conflictChanges, setConflictChanges] = useState<Array<{ opId: string; currentRevision: number; current?: import('./model').CloudChange }>>([]);
  const stateRef = useRef(accountState);
  const snapshotRef = useRef(snapshot);
  const userRef = useRef(user);
  const syncRef = useRef<() => Promise<void>>(async () => undefined);
  const retryTimerRef = useRef(0);
  const retryAttemptRef = useRef(0);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => { stateRef.current = accountState; }, [accountState]);
  useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);
  useEffect(() => { userRef.current = user; }, [user]);

  const persist = useCallback(async (state: CloudAccountState, local?: LocalCloudSnapshot) => {
    const current = userRef.current;
    if (!current) return;
    await saveCloudState(current.id, state, local);
    stateRef.current = state;
    setAccountState(state);
    channelRef.current?.postMessage({ accountId: current.id, type: 'state' });
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('anilife-cloud-sync');
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<{ accountId?: string; type?: string }>) => {
      const account = userRef.current;
      if (!account || event.data?.accountId !== account.id) return;
      if (event.data.type === 'signed_out') {
        void loadCloudSnapshot('guest').then((guest) => {
          if (guest) applySnapshot(guest);
          setUser(null);
          userRef.current = null;
          setAccountState(emptyCloudState());
          stateRef.current = emptyCloudState();
          setStatus('local_only');
        });
        return;
      }
      void Promise.all([loadCloudState(account.id), loadCloudSnapshot(account.id)]).then(([state, local]) => {
        stateRef.current = state;
        setAccountState(state);
        if (local) {
          snapshotRef.current = local;
          applySnapshot(local);
        }
        setStatus(state.enabled ? (state.outbox.length ? 'pending' : 'up_to_date') : 'signed_in');
      });
    };
    return () => {
      channelRef.current = null;
      channel.close();
    };
  }, [applySnapshot]);

  useEffect(() => {
    let cancelled = false;
    void getCloudUser().then(async (current) => {
      if (cancelled) return;
      if (!current) {
        setAuthChecked(true);
        return;
      }
      const stored = await loadCloudState(current.id);
      const local = await loadCloudSnapshot(current.id);
      if (cancelled) return;
      setUser(current);
      userRef.current = current;
      setAccountState(stored);
      stateRef.current = stored;
      if (local) {
        applySnapshot(local);
        snapshotRef.current = local;
      }
      setStatus(stored.enabled ? (stored.outbox.length ? 'pending' : 'up_to_date') : 'signed_in');
      setAuthChecked(true);
    }).catch(() => setAuthChecked(true));
    return () => { cancelled = true; };
  }, [applySnapshot]);

  useEffect(() => {
    if (!authChecked || (user && stateRef.current.enabled)) return;
    void saveCloudSnapshot(user?.id ?? 'guest', snapshot).catch(() => undefined);
  }, [authChecked, snapshot, user]);

  const syncNow = useCallback(async () => {
    const currentUser = userRef.current;
    if (!currentUser || !stateRef.current.enabled) return;
    if (!navigator.onLine) {
      setStatus('offline');
      return;
    }
    setStatus('syncing');
    setMessage(null);
    window.clearTimeout(retryTimerRef.current);
    try {
      await withSyncLock(async () => {
        let state = await loadCloudState(currentUser.id);
        stateRef.current = state;
        let local = snapshotRef.current;
        let pulled: BootstrapResult;
        try {
          pulled = await bootstrapCloud(state.cursor);
        } catch (error) {
          if (!(error instanceof CloudSyncError) || error.status !== 410) throw error;
          pulled = await bootstrapCloud(null);
          state = { ...state, cursor: null, shadow: {} };
        }
        state = {
          ...state,
          deviceId: pulled.deviceId,
          cursor: pulled.cursor,
          shadow: applyChangesToShadow(state.shadow, pulled.changes),
        };
        if (pulled.changes.length) {
          local = mergeRemoteChanges(local, pulled.changes, state.profileMap, false);
          applySnapshot(local);
          snapshotRef.current = local;
        }
        state = stageSnapshot(state, local);
        await persist(state, local);

        let hasMore = false;
        for (let page = 0; page < 100; page += 1) {
          if (state.outbox.length === 0 && !hasMore) break;
          const result = await pushPullCloud(currentUser.id, state);
          state = result.state;
          hasMore = result.hasMore;
          if (result.changes.length) {
            local = mergeRemoteChanges(local, result.changes, state.profileMap, false);
            applySnapshot(local);
            snapshotRef.current = local;
            await saveCloudState(currentUser.id, state, local);
          }
          if (!hasMore && state.outbox.length === 0) break;
          if (page === 99) throw new CloudSyncError(502, 'sync_page_limit');
        }
        stateRef.current = state;
        setAccountState(state);
        setStatus(state.outbox.length ? 'pending' : 'up_to_date');
        retryAttemptRef.current = 0;
      });
    } catch (error) {
      if (error instanceof CloudSyncError) {
        if (error.code === 'sync_busy') {
          setStatus(stateRef.current.outbox.length ? 'pending' : 'up_to_date');
          return;
        }
        if (error.status === 401) setStatus('expired');
        else if (error.status === 409) {
          const conflicts = Array.isArray(error.detail?.conflicts) ? error.detail.conflicts : [];
          setConflictChanges(conflicts as typeof conflictChanges);
          setStatus('conflict');
        }
        else if (error.status >= 500 || error.status === 429) setStatus(navigator.onLine ? 'error' : 'offline');
        else setStatus('error');
        setMessage(error.code.replaceAll('_', ' '));
        const delay = navigator.onLine ? retryDelayMs(error, retryAttemptRef.current) : null;
        if (delay !== null) {
          retryAttemptRef.current += 1;
          retryTimerRef.current = window.setTimeout(() => void syncRef.current(), delay);
        }
      } else {
        setStatus(navigator.onLine ? 'error' : 'offline');
        setMessage('sync unavailable');
      }
    }
  }, [applySnapshot, persist]);

  useEffect(() => { syncRef.current = syncNow; }, [syncNow]);

  useEffect(() => () => window.clearTimeout(retryTimerRef.current), []);

  useEffect(() => {
    const current = userRef.current;
    if (!current || !stateRef.current.enabled || !stateRef.current.initialized) return;
    let timer = 0;
    let cancelled = false;
    void withSyncLock(async () => {
      const latest = await loadCloudState(current.id);
      const staged = stageSnapshot(latest, snapshotRef.current);
      await persist(staged, snapshotRef.current);
      if (!cancelled && staged.outbox.length > 0) {
        setStatus('pending');
        timer = window.setTimeout(() => void syncRef.current(), 60_000);
      }
    }).catch((error) => {
      if (error instanceof CloudSyncError && error.code === 'sync_busy') return;
      setStatus('error');
      setMessage('local sync journal unavailable');
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [snapshot, persist]);

  useEffect(() => {
    const eligible = () => {
      const state = stateRef.current;
      return state.enabled && (state.outbox.length > 0 || !state.lastSyncedAt || Date.now() - state.lastSyncedAt > 10 * 60_000);
    };
    const onOnline = () => { if (eligible()) void syncRef.current(); };
    const onVisible = () => { if (document.visibilityState === 'visible' && eligible()) void syncRef.current(); };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const previewCloud = useCallback(async () => {
    setStatus('syncing');
    try {
      const result = await bootstrapCloud(null);
      setCloudPreview(preview(result));
      setStatus('signed_in');
    } catch (error) {
      setStatus(error instanceof CloudSyncError && error.status === 401 ? 'expired' : 'error');
      setMessage(error instanceof Error ? error.message : 'preview unavailable');
    }
  }, []);

  const enableCloud = useCallback(async (selectedRemoteProfile?: string) => {
    const currentUser = userRef.current;
    if (!currentUser || !cloudPreview) return;
    const profileMap = { ...stateRef.current.profileMap };
    if (selectedRemoteProfile) profileMap[snapshotRef.current.activeProfileId] = selectedRemoteProfile;
    const initialState: CloudAccountState = {
      ...stateRef.current,
      enabled: true,
      initialized: true,
      cursor: cloudPreview.result.cursor,
      deviceId: cloudPreview.result.deviceId,
      profileMap,
      shadow: applyChangesToShadow({}, cloudPreview.result.changes),
    };
    const merged = mergeRemoteChanges(snapshotRef.current, cloudPreview.result.changes, profileMap, true);
    const staged = stageSnapshot(initialState, merged);
    applySnapshot(merged);
    snapshotRef.current = merged;
    await persist(staged, merged);
    setCloudPreview(null);
    setStatus(staged.outbox.length ? 'pending' : 'up_to_date');
    await syncRef.current();
  }, [applySnapshot, cloudPreview, persist]);

  const disconnect = useCallback(async () => {
    if (!userRef.current) return;
    const next = { ...stateRef.current, enabled: false };
    await persist(next);
    setStatus('signed_in');
  }, [persist]);

  const signOut = useCallback(async () => {
    const account = userRef.current;
    try {
      if (stateRef.current.deviceId) {
        const pulled = await bootstrapCloud(stateRef.current.cursor);
        await revokeCloudDevice({ ...stateRef.current, deviceId: pulled.deviceId, cursor: pulled.cursor });
      }
    } finally {
      await signOutCloud();
      if (account) await saveCloudState(account.id, { ...stateRef.current, enabled: false }, snapshotRef.current);
      const guest = await loadCloudSnapshot('guest');
      if (guest) {
        applySnapshot(guest);
        snapshotRef.current = guest;
      }
      if (account) channelRef.current?.postMessage({ accountId: account.id, type: 'signed_out' });
      setUser(null);
      userRef.current = null;
      setAccountState(emptyCloudState());
      stateRef.current = emptyCloudState();
      setStatus('local_only');
    }
  }, [applySnapshot]);

  const exportData = useCallback(async () => {
    const changes = await exportCloudData();
    downloadJson({ protocolVersion: 1, exportedAt: new Date().toISOString(), changes }, 'anilife-cloud-export.json');
  }, []);

  const deleteAccount = useCallback(async () => {
    const account = userRef.current;
    if (!account) return;
    await bootstrapCloud(stateRef.current.cursor);
    await deleteCloudAccount();
    await saveCloudSnapshot('guest', snapshotRef.current);
    await saveCloudState(account.id, emptyCloudState());
    channelRef.current?.postMessage({ accountId: account.id, type: 'signed_out' });
    setUser(null);
    userRef.current = null;
    setAccountState(emptyCloudState());
    stateRef.current = emptyCloudState();
    setStatus('local_only');
  }, []);

  const resolveConflicts = useCallback(async (choice: 'keep_local' | 'use_cloud') => {
    const account = userRef.current;
    if (!account || conflictChanges.length === 0) return;
    await withSyncLock(async () => {
      let state = await loadCloudState(account.id);
      const operations = new Map(state.outbox.map((operation) => [operation.opId, operation]));
      const conflictIds = new Set(conflictChanges.map((conflict) => conflict.opId));
      const currentChanges = conflictChanges.flatMap((conflict) => {
        if (conflict.current) return [conflict.current];
        const operation = operations.get(conflict.opId);
        return operation ? [{
          profileId: operation.profileId,
          entityType: operation.entityType,
          entityKey: operation.entityKey,
          action: 'delete' as const,
          revision: conflict.currentRevision,
        }] : [];
      });
      if (choice === 'use_cloud') {
        state = {
          ...state,
          outbox: state.outbox.filter((operation) => !conflictIds.has(operation.opId)),
          shadow: applyChangesToShadow(state.shadow, currentChanges),
        };
        if (currentChanges.length) {
          const merged = mergeRemoteChanges(snapshotRef.current, currentChanges, state.profileMap, false);
          applySnapshot(merged);
          snapshotRef.current = merged;
          await persist(state, merged);
        } else {
          await persist(state);
        }
      } else {
        const revisions = new Map(conflictChanges.map((conflict) => [conflict.opId, conflict.currentRevision]));
        state = {
          ...state,
          outbox: state.outbox.map((operation) => revisions.has(operation.opId)
            ? { ...operation, opId: crypto.randomUUID(), baseRevision: revisions.get(operation.opId) as number, attempted: false }
            : operation),
          shadow: applyChangesToShadow(state.shadow, currentChanges),
        };
        await persist(state);
      }
    });
    setConflictChanges([]);
    setStatus('pending');
    await syncRef.current();
  }, [applySnapshot, conflictChanges, persist]);

  return {
    user,
    enabled: accountState.enabled,
    status,
    pending: accountState.outbox.length,
    lastSyncedAt: accountState.lastSyncedAt,
    message,
    preview: cloudPreview,
    signIn: beginCloudSignIn,
    previewCloud,
    enableCloud,
    syncNow,
    disconnect,
    signOut,
    exportData,
    deleteAccount,
    conflicts: conflictChanges.length,
    resolveConflicts,
  };
}
