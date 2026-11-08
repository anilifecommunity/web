import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getProvider,
  planAttempts,
  parsePlaybackOffer,
  PROVIDERS,
  providersForWeb,
  resolvePlayback,
  ResolverError,
} from './index';
import type { PlaybackOffer, ProviderAdapter } from './index';

const A = 'anichan';
const B = 'toonhub';

function offer(overrides: Partial<PlaybackOffer> = {}): PlaybackOffer {
  return {
    schemaVersion: 1,
    aniListId: 154587,
    malId: 52991,
    episodeRef: '1',
    providerId: A,
    rightsStatus: 'unknown',
    browserSupport: 'supported',
    streams: [{ format: 'hls', audio: 'sub', url: 'https://cdn.example.com/master.m3u8' }],
    subtitles: [],
    ...overrides,
  };
}

const request = {
  aniListId: 154587,
  malId: 52991,
  episodeRef: '1',
  audio: 'sub' as const,
};

// ---------------------------------------------------------------- registry

test('registry ids are unique and schema-safe', () => {
  const ids = PROVIDERS.map((provider) => provider.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.match(id, /^[a-z0-9][a-z0-9-]*$/);
  }
});

test('registry contains no lili or xfdm entry', () => {
  for (const id of ['lili', 'xfdm', 'sanilili']) {
    assert.equal(getProvider(id), undefined, `${id} must not exist`);
  }
  assert.ok(!PROVIDERS.some((provider) => /lili/i.test(provider.id)));
});

test('miruro native providers are not attemptable on web', () => {
  for (const id of ['bee', 'bonk', 'kiwi', 'moo']) {
    assert.equal(getProvider(id)?.webStatus, 'unavailable');
  }
});

test('web picker hides providers that cannot work in a browser', () => {
  const ids = providersForWeb(true).map((provider) => provider.id);
  assert.ok(!ids.includes('animepahe'));
  assert.ok(!ids.includes('bee'));
  assert.ok(ids.includes('anichan'));
});

// ---------------------------------------------------------------- policy

test('explicit selection is first and alone without fallback', () => {
  const plan = planAttempts({ selectedProvider: B, allowFallback: false });
  assert.deepEqual(plan.order, [B]);
});

test('fallback appends the configured order after the selection', () => {
  const plan = planAttempts({
    selectedProvider: B,
    allowFallback: true,
    preferredOrder: [A, B, 'zoko'],
  });
  assert.deepEqual(plan.order, [B, A]);
});

test('a provider that cannot work in a browser is refused, not replaced', () => {
  const plan = planAttempts({ selectedProvider: 'zoko', allowFallback: false });
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'not_available_on_web');
});

test('an unknown provider is refused', () => {
  const plan = planAttempts({ selectedProvider: 'nope', allowFallback: true });
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'unknown_provider');
});

test('disabled providers leave the order', () => {
  const plan = planAttempts({
    allowFallback: true,
    preferredOrder: [A, B],
    enabled: [B],
  });
  assert.deepEqual(plan.order, [B]);
});

test('declared-language providers stay out of automatic walks for other languages', () => {
  const english = planAttempts({
    allowFallback: true,
    preferredOrder: ['animeav1', A],
    preferredLanguage: 'English',
  });
  assert.deepEqual(english.order, [A]);

  // animeav1 is Spanish and still unverified, so a Spanish request adds nothing yet; an
  // undeclared provider is English and must not be offered either.
  const spanish = planAttempts({
    allowFallback: true,
    preferredOrder: ['animeav1', A],
    preferredLanguage: 'Spanish',
  });
  assert.deepEqual(spanish.order, []);
  assert.equal(getProvider('animeav1')?.declaredLanguage, 'Spanish');
});

// ---------------------------------------------------------------- validation

test('accepts a well-formed offer', () => {
  assert.ok(parsePlaybackOffer(offer()));
});

test('rejects non-https and empty stream lists', () => {
  assert.equal(parsePlaybackOffer(offer({
    streams: [{ format: 'hls', audio: 'sub', url: 'http://cdn.example.com/master.m3u8' }],
  })), null);
  assert.equal(parsePlaybackOffer(offer({ streams: [] })), null);
});

test('rejects unknown keys and malformed skip windows', () => {
  assert.equal(parsePlaybackOffer({ ...offer(), extra: true } as unknown), null);
  assert.equal(parsePlaybackOffer(offer({
    skipWindows: [{ kind: 'intro', startMs: 10, endMs: 5 }],
  })), null);
});

test('rejects a subtitle that is not https', () => {
  assert.equal(parsePlaybackOffer(offer({
    subtitles: [{ language: 'en', url: 'http://cdn.example.com/en.vtt' }],
  })), null);
});

// ---------------------------------------------------------------- resolve

test('returns the first usable offer', async () => {
  const adapters: Record<string, ProviderAdapter> = {
    [A]: async () => offer(),
  };
  const result = await resolvePlayback({
    request,
    policy: { selectedProvider: A, allowFallback: false },
    adapters,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.offer.providerId, A);
    assert.equal(result.attempts.length, 1);
  }
});

test('does not fall back when fallback is disabled', async () => {
  let secondCalled = false;
  const adapters: Record<string, ProviderAdapter> = {
    [A]: async () => { throw new ResolverError('provider_unavailable'); },
    [B]: async () => { secondCalled = true; return offer({ providerId: B }); },
  };
  const result = await resolvePlayback({
    request,
    policy: { selectedProvider: A, allowFallback: false, preferredOrder: [A, B] },
    adapters,
  });
  assert.equal(result.ok, false);
  assert.equal(secondCalled, false);
  assert.equal(result.attempts[0].reason, 'provider_unavailable');
});

test('falls back in order when allowed and reports attempts', async () => {
  const adapters: Record<string, ProviderAdapter> = {
    [A]: async () => { throw new ResolverError('timeout'); },
    [B]: async () => offer({ providerId: B }),
  };
  const result = await resolvePlayback({
    request,
    policy: { selectedProvider: A, allowFallback: true, preferredOrder: [A, B] },
    adapters,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.offer.providerId, B);
    assert.deepEqual(result.attempts.map((attempt) => attempt.providerId), [A, B]);
  }
});

test('rejects an offer with the wrong audio instead of playing it', async () => {
  const adapters: Record<string, ProviderAdapter> = {
    [A]: async () => offer({
      streams: [{ format: 'hls', audio: 'dub', url: 'https://cdn.example.com/dub.m3u8' }],
    }),
  };
  const result = await resolvePlayback({
    request,
    policy: { selectedProvider: A, allowFallback: false },
    adapters,
  });
  assert.equal(result.ok, false);
  assert.equal(result.attempts[0].reason, 'audio_unavailable');
});

test('rejects an offer that names another provider or episode', async () => {
  const adapters: Record<string, ProviderAdapter> = {
    [A]: async () => offer({ providerId: B }),
  };
  const result = await resolvePlayback({
    request,
    policy: { selectedProvider: A, allowFallback: false },
    adapters,
  });
  assert.equal(result.ok, false);
  assert.equal(result.attempts[0].reason, 'invalid_response');
});

test('times out a provider that never answers', async () => {
  const adapters: Record<string, ProviderAdapter> = {
    [A]: () => new Promise<PlaybackOffer>(() => {}),
  };
  const result = await resolvePlayback({
    request,
    policy: { selectedProvider: A, allowFallback: false },
    adapters,
    timeoutMs: 20,
  });
  assert.equal(result.ok, false);
  assert.equal(result.attempts[0].reason, 'timeout');
  assert.equal(result.attempts[0].androidCode, 'SRC-05');
});
