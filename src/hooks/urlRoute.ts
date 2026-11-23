export type Tab = 'home' | 'search' | 'schedule' | 'mylist' | 'downloads';

export type Route =
  | { kind: 'tab'; tab: Tab }
  | { kind: 'anime'; id: string }
  | { kind: 'legacyWatch'; id: string; episode: number }
  | { kind: 'watch'; reference: string; episode: number; tag: string }
  | { kind: 'settings' }
  | { kind: 'profiles' }
  | { kind: 'notFound'; path: string };

export const TAB_PATHS: Record<Tab, string> = {
  home: '/',
  search: '/discover',
  schedule: '/schedule',
  mylist: '/library',
  downloads: '/downloads',
};

export function parseRoute(pathname: string): Route {
  let parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'activity') parts = parts.slice(1);
  if (parts.length === 0) return { kind: 'tab', tab: 'home' };

  const [first, second, , fourth] = parts;
  if (first === 'watch' && second && parts.length === 3) {
    const match = /^episode-(\d+)-([0-9a-f]{12})$/.exec(parts[2]);
    const episode = match ? Number(match[1]) : 0;
    if (/^[0-9a-f-]{36}$/i.test(second) && match && Number.isSafeInteger(episode) && episode > 0) {
      return { kind: 'watch', reference: second, episode, tag: match[2] };
    }
  }
  if (first === 'anime' && second) {
    if (parts.length === 4 && parts[2] === 'watch') {
      const episode = Number(fourth);
      if (Number.isSafeInteger(episode) && episode > 0) {
        return { kind: 'legacyWatch', id: second, episode };
      }
    }
    if (parts.length === 2) return { kind: 'anime', id: second };
  }
  if (parts.length === 1 && first === 'settings') return { kind: 'settings' };
  if (parts.length === 1 && first === 'profiles') return { kind: 'profiles' };
  if (parts.length === 1 && (first === 'search' || first === 'discover')) return { kind: 'tab', tab: 'search' };
  if (parts.length === 1 && first === 'schedule') return { kind: 'tab', tab: 'schedule' };
  if (parts.length === 1 && (first === 'library' || first === 'mylist')) return { kind: 'tab', tab: 'mylist' };
  if (parts.length === 1 && first === 'downloads') return { kind: 'tab', tab: 'downloads' };
  if (parts.length === 1 && first === 'home') return { kind: 'tab', tab: 'home' };
  return { kind: 'notFound', path: pathname };
}

export function shouldPushRoute(currentPath: string, nextPath: string): boolean {
  if (currentPath === nextPath) return false;
  if (parseRoute(currentPath).kind === 'watch' && parseRoute(nextPath).kind === 'watch') return true;
  return nextPath.split('/').filter(Boolean).length > currentPath.split('/').filter(Boolean).length;
}
