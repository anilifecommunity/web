import type { AdapterContext, PlaybackOffer, PlaybackStream, ProviderAdapter, ResolveRequest } from '../../src/resolver';
import { extensionIds, runExtension } from '../extensions/run';

const ANILIST = 'https://graphql.anilist.co';

async function loadTitles(id: number, signal: AbortSignal) {
  const res = await fetch(ANILIST, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'query($id:Int){Media(id:$id,type:ANIME){idMal title{romaji english native} synonyms}}',
      variables: { id },
    }),
  });
  if (!res.ok) throw new Error('anilist_unavailable');
  const m = ((await res.json()) as any)?.data?.Media;
  const titles = [m?.title?.english, m?.title?.romaji, ...(m?.synonyms ?? [])].filter((t: unknown): t is string => typeof t === 'string' && t.length > 0);
  if (titles.length === 0) throw new Error('no_titles');
  return { titles: [...new Set(titles)].slice(0, 8), malId: (m?.idMal as number | null) ?? null };
}

const episodeNumber = (ref: string) => {
  const m = /(\d+(?:\.\d+)?)$/.exec(ref);
  return m ? Number(m[1]) : Number.NaN;
};

// Streams that need custom request headers are skipped: browsers can't send them and the web has no media relay.
export function makeExtensionAdapter(id: string): ProviderAdapter {
  return async (request: ResolveRequest, ctx: AdapterContext): Promise<PlaybackOffer> => {
    const episode = episodeNumber(request.episodeRef);
    if (!Number.isFinite(episode)) throw new Error('invalid_response');
    const wantDub = request.audio === 'dub';
    const { titles, malId } = await loadTitles(request.aniListId, ctx.signal);

    const servers = await runExtension(id, {
      anilistId: request.aniListId, malId: request.malId ?? malId ?? undefined, titles, episode, dub: wantDub,
    }, (line) => console.log(line));

    const streams: PlaybackStream[] = [];
    for (const s of servers ?? []) {
      if ((s.headers?.length ?? 0) > 0) continue;
      if (request.audio !== 'multi' && request.audio !== 'unknown' && s.dub !== wantDub) continue;
      for (const st of s.streams ?? []) {
        if (!/^https:\/\//.test(st.url)) continue;
        const format = st.format === 'mp4' || st.format === 'dash' ? st.format : st.format === 'hls' ? 'hls' : null;
        if (!format) continue;
        streams.push({ format, audio: s.dub ? 'dub' : 'sub', url: st.url, quality: st.quality ?? null });
      }
    }
    return {
      schemaVersion: 1, aniListId: request.aniListId, malId: request.malId ?? malId,
      episodeRef: request.episodeRef, providerId: id, rightsStatus: 'pending', browserSupport: 'unknown',
      streams, subtitles: [], errorCode: streams.length ? undefined : 'no_streams',
    };
  };
}

export const extensionAdapters: Record<string, ProviderAdapter> =
  Object.fromEntries(extensionIds().map((id) => [id, makeExtensionAdapter(id)]));
