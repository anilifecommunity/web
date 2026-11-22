import { runWithReplay, type HostImports } from './replay';
import { makePolicedFetch } from './policedFetch';
import { EXTENSIONS } from './generated';

export interface ExtensionQuery { anilistId: number; malId?: number; titles: string[]; episode: number; dub: boolean }
export interface ExtensionStream { url: string; quality?: string | null; format?: string }
export interface ExtensionServer { name: string; dub: boolean; headers?: Array<[string, string]>; streams?: ExtensionStream[] }

// shared across requests while the isolate stays warm
const cache = new Map<string, { value: string; expires: number }>();

export const extensionIds = () => Object.keys(EXTENSIONS);

export async function runExtension(id: string, query: ExtensionQuery, onLog: (line: string) => void = () => {}): Promise<ExtensionServer[]> {
  const ext = EXTENSIONS[id];
  if (!ext) throw new Error('unknown_extension');
  return runWithReplay<ExtensionQuery, ExtensionServer[]>({
    cache, query, onLog: (line) => onLog(`[${id}] ${line}`),
    fetchAsync: makePolicedFetch(ext.hosts),
    instantiate: async (host: HostImports) => {
      const exports = await ext.instantiate(host);
      return (q: ExtensionQuery) => exports.servers(q) as ExtensionServer[];
    },
  });
}
