export type Tab = 'home' | 'search' | 'schedule' | 'mylist' | 'downloads';

export type Route =
  | { kind: 'tab'; tab: Tab }
  | { kind: 'anime'; id: string }
  | { kind: 'watch'; id: string; episode: number }
  | { kind: 'settings' }
  | { kind: 'profiles' }
  | { kind: 'home' };

export const TAB_PATHS: Record<Tab, string> = {
  home: '/',
  search: '/discover',
  schedule: '/schedule',
  mylist: '/library',
  downloads: '/downloads',
};

export function parseRoute(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return { kind: 'tab', tab: 'home' };

  const [first, second, , fourth] = parts;
  if (first === 'anime' && second) {
    if (parts.length >= 4 && parts[2] === 'watch') {
      const episode = Number(fourth);
      return { kind: 'watch', id: second, episode: Number.isFinite(episode) && episode > 0 ? episode : 1 };
    }
    return { kind: 'anime', id: second };
  }
  if (first === 'settings') return { kind: 'settings' };
  if (first === 'profiles') return { kind: 'profiles' };
  if (first === 'search' || first === 'discover') return { kind: 'tab', tab: 'search' };
  if (first === 'schedule') return { kind: 'tab', tab: 'schedule' };
  if (first === 'library' || first === 'mylist') return { kind: 'tab', tab: 'mylist' };
  if (first === 'downloads') return { kind: 'tab', tab: 'downloads' };
  if (first === 'home') return { kind: 'tab', tab: 'home' };
  return { kind: 'home' };
}
