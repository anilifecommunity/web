export type DownstreamStatus =
  | 'in-use'
  | 'embeddable-unmapped'
  | 'iframe-blocked'
  | 'requires-auth'
  | 'gone'
  | 'unverified';

export interface Downstream {
  id: string;
  name: string;
  role: 'embed-index' | 'player-host';
  origins: string[];
  status: DownstreamStatus;
  iframe: 'allowed' | 'blocked' | 'unknown';
  terms: 'unreviewed' | 'documented';
  evidenceDate: string;
  notes: string;
}

/**
 * Downstream player and embed hosts are not anime catalogues. They cannot be offered as a
 * selectable server on their own: a source adapter must first map an AniList title and episode to
 * a host-specific id. This registry records what was actually observed, not what a host name
 * implies.
 */
export const DOWNSTREAMS: Downstream[] = [
  {
    id: 'flixcloud',
    name: 'Flixcloud',
    role: 'player-host',
    origins: ['https://flixcloud.cc'],
    status: 'in-use',
    iframe: 'allowed',
    terms: 'unreviewed',
    evidenceDate: '2026-11-08',
    notes: 'Reanime returns a per-episode Flixcloud player URL. Chromium playback verified; the iframe cannot report progress.',
  },
  {
    id: 'vidnest',
    name: 'VidNest',
    role: 'embed-index',
    origins: ['https://vidnest.fun'],
    status: 'iframe-blocked',
    iframe: 'blocked',
    terms: 'unreviewed',
    evidenceDate: '2026-11-08',
    notes: 'Blocked in the browser tunnel (ERR_TUNNEL_CONNECTION_FAILED). Not added as a server.',
  },
  {
    id: 'vidsrc',
    name: 'VidSrc',
    role: 'embed-index',
    origins: ['https://vidsrc.to'],
    status: 'in-use',
    iframe: 'allowed',
    terms: 'unreviewed',
    evidenceDate: '2026-11-08',
    notes: 'AniZip maps AniList id/episode to a TMDB id and season/episode; the vidsrc.to embed page answered 200 with no X-Frame-Options. Used as an automatic fallback behind Reanime; media startup needs a user test.',
  },
  {
    id: 'vidlink',
    name: 'VidLink',
    role: 'embed-index',
    origins: ['https://vidlink.pro'],
    status: 'in-use',
    iframe: 'allowed',
    terms: 'unreviewed',
    evidenceDate: '2026-11-08',
    notes: 'AniZip TMDB mapping. The player page loaded a video element and the correct title in Chromium; separate automatic fallback server.',
  },
  {
    id: 'vidfast',
    name: 'VidFast',
    role: 'embed-index',
    origins: ['https://vidfast.vc'],
    status: 'unverified',
    iframe: 'unknown',
    terms: 'unreviewed',
    evidenceDate: '2026-11-08',
    notes: 'Stayed on "FETCHING, ONE MOMENT..." in Chromium and never started media. Removed from the server list until re-tested.',
  },
  {
    id: '2embed',
    name: '2Embed',
    role: 'embed-index',
    origins: ['https://www.2embed.skin', 'https://streamsrcs.2embed.cc'],
    status: 'embeddable-unmapped',
    iframe: 'allowed',
    terms: 'unreviewed',
    evidenceDate: '2026-11-08',
    notes: 'Uses the AniZip IMDb id and 2embed.skin/embedtv; the page exposes the player embed and no X-Frame-Options. Media startup still needs a user test.',
  },
  {
    id: 'vidstream',
    name: 'Vidstream',
    role: 'player-host',
    origins: ['https://vidstream.pro'],
    status: 'embeddable-unmapped',
    iframe: 'allowed',
    terms: 'unreviewed',
    evidenceDate: '2026-11-08',
    notes: 'Homepage answered 200 with no X-Frame-Options. A source must supply the host-specific file or embed id first.',
  },
  {
    id: 'vidcloud',
    name: 'VidCloud / VidWish',
    role: 'player-host',
    origins: [],
    status: 'unverified',
    iframe: 'unknown',
    terms: 'unreviewed',
    evidenceDate: '2026-11-08',
    notes: 'No current first-party origin or stable public interface was confirmed. Alias and ownership claims were not repeated as fact.',
  },
  {
    id: 'megacloud',
    name: 'MegaCloud',
    role: 'player-host',
    origins: ['https://megacloud.tv'],
    status: 'iframe-blocked',
    iframe: 'blocked',
    terms: 'unreviewed',
    evidenceDate: '2026-11-08',
    notes: 'Homepage answered 200 with X-Frame-Options: SAMEORIGIN, so a cross-origin Anilife iframe cannot load it directly.',
  },
  {
    id: 'streamtape',
    name: 'Streamtape',
    role: 'player-host',
    origins: ['https://streamtape.com'],
    status: 'embeddable-unmapped',
    iframe: 'allowed',
    terms: 'unreviewed',
    evidenceDate: '2026-11-08',
    notes: 'Homepage answered 200 with no X-Frame-Options. Approved API scope and media rights were not established.',
  },
  {
    id: 'filemoon',
    name: 'Filemoon',
    role: 'player-host',
    origins: ['https://filemoon.sx'],
    status: 'embeddable-unmapped',
    iframe: 'allowed',
    terms: 'unreviewed',
    evidenceDate: '2026-11-08',
    notes: 'Homepage answered 200 with no X-Frame-Options. A source must supply the file or embed id.',
  },
  {
    id: 'vidmoly',
    name: 'Vidmoly',
    role: 'player-host',
    origins: ['https://vidmoly.to'],
    status: 'requires-auth',
    iframe: 'unknown',
    terms: 'unreviewed',
    evidenceDate: '2026-11-08',
    notes: 'Homepage returned 401. No attempt was made to bypass authentication.',
  },
  {
    id: 'mp4upload',
    name: 'MP4Upload',
    role: 'player-host',
    origins: ['https://mp4upload.com'],
    status: 'iframe-blocked',
    iframe: 'blocked',
    terms: 'unreviewed',
    evidenceDate: '2026-11-08',
    notes: 'Homepage answered 200 with X-Frame-Options: SAMEORIGIN, so it cannot be embedded directly.',
  },
];
