import { betterAuth } from 'better-auth';
import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from './index';
import { fail } from './http';

const PRODUCTION_AUTH_BASE_URL = 'https://anilife.cc';
const SESSION_SECONDS = 60 * 60 * 24 * 30;

export function sessionCookieName(env: Env): string {
  return authBaseUrl(env)?.startsWith('https://') ? '__Host-anilife-session' : 'anilife-session';
}

export function authConfigured(env: Env): boolean {
  return Boolean(
    env.ANILIFE_CLOUD_DB &&
    env.BETTER_AUTH_SECRET &&
    env.BETTER_AUTH_SECRET.length >= 32 &&
    env.DISCORD_CLIENT_ID &&
    env.DISCORD_CLIENT_SECRET &&
    authBaseUrl(env)
  );
}

export function authBaseUrl(env: Env): string | null {
  try {
    const url = new URL(env.AUTH_BASE_URL ?? PRODUCTION_AUTH_BASE_URL);
    const localDevelopment = env.APP_ENV !== 'production' &&
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(url.hostname);
    if (
      (url.protocol !== 'https:' && !localDevelopment) ||
      url.username || url.password || url.search || url.hash ||
      (url.pathname !== '/' && url.pathname !== '')
    ) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function withoutProviderTokens<T extends Record<string, unknown>>(account: T): T {
  return {
    ...account,
    accessToken: null,
    refreshToken: null,
    idToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
  };
}

export function createAuth(env: Env) {
  if (!authConfigured(env)) return null;
  const baseURL = authBaseUrl(env) as string;
  const secure = new URL(baseURL).protocol === 'https:';
  const database = env.ANILIFE_CLOUD_DB as D1Database;
  const secret = env.BETTER_AUTH_SECRET as string;
  const clientId = env.DISCORD_CLIENT_ID as string;
  const clientSecret = env.DISCORD_CLIENT_SECRET as string;
  return betterAuth({
    appName: 'Anilife',
    baseURL,
    basePath: '/api/auth',
    database,
    secret,
    trustedOrigins: [new URL(baseURL).origin],
    socialProviders: {
      discord: {
        clientId,
        clientSecret,
      },
    },
    session: {
      expiresIn: SESSION_SECONDS,
      updateAge: 60 * 60 * 24,
    },
    account: { updateAccountOnSignIn: false },
    databaseHooks: {
      account: {
        create: { before: async (account) => ({ data: withoutProviderTokens(account) }) },
        update: { before: async (account) => ({ data: withoutProviderTokens(account) }) },
      },
    },
    advanced: {
      // Better Auth otherwise adds its own __Secure prefix, which would diverge from the v1 contract.
      useSecureCookies: false,
      cookiePrefix: 'anilife-cloud',
      cookies: {
        session_token: {
          name: sessionCookieName(env),
        },
      },
      defaultCookieAttributes: {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
      },
    },
    telemetry: { enabled: false },
  });
}

export interface CloudSession {
  userId: string;
  sessionId: string;
}

export async function getCloudSession(request: Request, env: Env): Promise<CloudSession | null> {
  const auth = createAuth(env);
  if (!auth) return null;
  const result = await auth.api.getSession({ headers: request.headers });
  return result ? { userId: result.user.id, sessionId: result.session.id } : null;
}

export function handleAuth(request: Request, env: Env): Promise<Response> {
  const auth = createAuth(env);
  return auth ? auth.handler(request) : Promise.resolve(fail(503, 'cloud_auth_not_configured'));
}
