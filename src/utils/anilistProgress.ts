export function createAniListProgressQueue(
  send: (mediaId: number, progress: number) => Promise<unknown>,
  now: () => number = Date.now,
  retryCooldownMs = 30_000,
) {
  const stateByMedia = new Map<number, {
    sent: number;
    pending: number;
    retryAt: number;
    running?: Promise<void>;
  }>();

  return (mediaId: number, progress: number): Promise<void> => {
    const state = stateByMedia.get(mediaId) ?? { sent: 0, pending: 0, retryAt: 0 };
    stateByMedia.set(mediaId, state);
    state.pending = Math.max(state.pending, progress);
    if (state.pending <= state.sent) return state.running ?? Promise.resolve();
    if (state.running) return state.running;
    if (now() < state.retryAt) return Promise.resolve();

    const running = (async () => {
      while (state.pending > state.sent) {
        const target = state.pending;
        try {
          await send(mediaId, target);
          state.sent = target;
          state.retryAt = 0;
        } catch (error) {
          state.retryAt = now() + retryCooldownMs;
          throw error;
        }
      }
    })().finally(() => {
      if (state.running === running) state.running = undefined;
    });
    state.running = running;
    return running;
  };
}
