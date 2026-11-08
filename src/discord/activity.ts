import type { DiscordSDK as DiscordSDKType } from '@discord/embedded-app-sdk';

export type DiscordStatus = 'unavailable' | 'connecting' | 'connected' | 'error';

export interface DiscordState {
  status: DiscordStatus;
  inActivity: boolean;
  username?: string;
  userId?: string;
  error?: string;
}

export interface DiscordActivityInput {
  type?: number;
  details?: string;
  state?: string;
  assets?: {
    large_image?: string;
    large_text?: string;
    small_image?: string;
    small_text?: string;
  };
  timestamps?: { start?: number; end?: number };
}

const CLIENT_ID = String(
  (import.meta.env.VITE_DISCORD_CLIENT_ID as string | undefined) ?? '1567279187893551185'
).trim();

let sdk: DiscordSDKType | null = null;
let setupPromise: Promise<DiscordState | null> | null = null;
let state: DiscordState = { status: 'unavailable', inActivity: false };
const listeners = new Set<(next: DiscordState) => void>();

function publish(patch: Partial<DiscordState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

export function getDiscordState(): DiscordState {
  return state;
}

export function subscribeDiscord(listener: (next: DiscordState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function isDiscordActivity(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.has('frame_id') && params.has('instance_id');
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function createVerifier(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function createChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function withTimeout<T>(promise: Promise<T>, ms: number, reason: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(reason)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function tokenExchange(code: string, codeVerifier: string): Promise<string> {
  const response = await fetch('/api/discord/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, codeVerifier }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    discordError?: string;
  };
  if (!response.ok || typeof data.access_token !== 'string') {
    if (response.status === 503) throw new Error('Discord is not configured on this server.');
    throw new Error(
      data.discordError ? `Discord token exchange failed (${data.discordError}).` : 'Discord token exchange failed.'
    );
  }
  return data.access_token;
}

async function setup(): Promise<DiscordState> {
  publish({ status: 'connecting', error: undefined });
  const { DiscordSDK } = await import('@discord/embedded-app-sdk');
  sdk = new DiscordSDK(CLIENT_ID);
  await withTimeout(sdk.ready(), 15_000, 'Discord did not respond.');

  const verifier = createVerifier();
  const challenge = await createChallenge(verifier);
  const { code } = await withTimeout(
    sdk.commands.authorize({
      client_id: CLIENT_ID,
      response_type: 'code',
      state: crypto.randomUUID(),
      prompt: 'none',
      scope: ['identify', 'rpc.activities.write'],
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }),
    120_000,
    'Discord authorization was not completed.'
  );

  const accessToken = await tokenExchange(code, verifier);
  const auth = await sdk.commands.authenticate({ access_token: accessToken });

  await fetch('/api/gate/discord', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: auth.access_token }),
  }).catch(() => undefined);

  const username = auth.user.global_name || auth.user.username;
  publish({
    status: 'connected',
    inActivity: true,
    username,
    userId: auth.user.id,
    error: undefined,
  });
  return { ...state };
}

export async function connectDiscordActivity(): Promise<DiscordState | null> {
  if (!isDiscordActivity()) {
    publish({ status: 'unavailable', inActivity: false });
    return null;
  }
  if (state.status === 'connected') return { ...state };
  if (!setupPromise) {
    setupPromise = setup().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Discord connection failed.';
      publish({ status: 'error', inActivity: true, error: message });
      setupPromise = null;
      return { ...state };
    });
  }
  return setupPromise;
}

type SetActivityInput = Parameters<DiscordSDKType['commands']['setActivity']>[0];

export async function setDiscordActivity(activity: DiscordActivityInput): Promise<void> {
  if (!sdk || state.status !== 'connected') return;
  try {
    await sdk.commands.setActivity({ activity } as SetActivityInput);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Discord presence failed.';
    publish({ status: 'error', error: message });
  }
}

export async function clearDiscordActivity(): Promise<void> {
  if (!sdk || state.status !== 'connected') return;
  try {
    await sdk.commands.setActivity({ activity: null } as SetActivityInput);
  } catch {
    // Presence clears when the Activity closes; nothing else to do.
  }
}
