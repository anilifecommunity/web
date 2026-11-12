export const ABOUT_NOTICE_KEY = 'anilife_about_notice_v1';

export function shouldShowAboutNotice(storage?: Storage): boolean {
  try {
    const target = storage ?? window.localStorage;
    return target.getItem(ABOUT_NOTICE_KEY) !== '1';
  } catch {
    return true;
  }
}

export function markAboutNoticeSeen(storage?: Storage): void {
  try {
    const target = storage ?? window.localStorage;
    target.setItem(ABOUT_NOTICE_KEY, '1');
  } catch {
    // Private mode or a blocked storage API: the notice simply returns next session.
  }
}
