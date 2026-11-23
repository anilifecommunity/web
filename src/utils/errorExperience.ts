export interface AppErrorState {
  status: number;
  code: string;
  message?: string;
  retryAfterSec?: number;
  onRetry?: () => void;
  dismissLabel?: string;
}
export interface ErrorPresentation {
  title: string;
  message: string;
  tone: 'missing' | 'access' | 'waiting' | 'service';
}

const STATUS_COPY: Record<number, ErrorPresentation> = {
  400: { title: "Something about that request isn't right.", message: 'The request could not be processed.', tone: 'missing' },
  401: { title: 'Verification required.', message: 'Complete browser verification before continuing.', tone: 'access' },
  403: { title: "You can't access this page.", message: 'The requested resource is restricted.', tone: 'access' },
  404: { title: 'Looks like this page went missing.', message: 'The page may have been removed, renamed or entered incorrectly.', tone: 'missing' },
  405: { title: "That action isn't supported.", message: 'Return to a valid page and try a supported action.', tone: 'missing' },
  408: { title: 'That request took too long.', message: 'The request timed out before it could finish.', tone: 'waiting' },
  409: { title: "We couldn't complete that change.", message: 'The request conflicts with the current state.', tone: 'missing' },
  410: { title: 'This link is no longer available.', message: 'Open the anime page to start a new watch session.', tone: 'missing' },
  413: { title: 'That file is too large.', message: 'Choose a smaller file and try again.', tone: 'missing' },
  415: { title: "This file type isn't supported.", message: 'Choose a supported format and try again.', tone: 'missing' },
  422: { title: 'Some information needs correcting.', message: 'Review the supplied information and try again.', tone: 'missing' },
  429: { title: "You're making requests too quickly.", message: 'Access has been temporarily rate-limited.', tone: 'waiting' },
  451: { title: "This content isn't available in your region.", message: 'Browse another title or return home.', tone: 'access' },
  500: { title: 'Something went wrong on our side.', message: 'Anilife encountered an unexpected problem.', tone: 'service' },
  501: { title: "This functionality isn't supported.", message: 'Return to a supported part of Anilife.', tone: 'service' },
  502: { title: "We're having trouble reaching a service.", message: 'A required service returned an invalid response.', tone: 'service' },
  503: { title: 'Anilife is temporarily unavailable.', message: 'The service cannot complete this request right now.', tone: 'service' },
  504: { title: 'The server took too long to respond.', message: 'Your current page and choices have been preserved.', tone: 'waiting' },
  507: { title: "There's not enough storage to complete this.", message: 'Free some browser storage and try again.', tone: 'service' },
  520: { title: 'A service returned an unknown error.', message: 'This is a temporary upstream service problem.', tone: 'service' },
  521: { title: 'The server is unavailable.', message: 'Anilife cannot reach its web server right now.', tone: 'service' },
  522: { title: 'The connection timed out.', message: 'The edge could not establish a timely connection.', tone: 'waiting' },
  523: { title: 'The service is unreachable.', message: 'The edge cannot currently reach the origin service.', tone: 'service' },
  524: { title: 'The request timed out.', message: 'The upstream operation did not finish in time.', tone: 'waiting' },
  525: { title: 'A secure connection could not be established.', message: 'The service has a TLS connection problem.', tone: 'service' },
  526: { title: 'The secure connection is misconfigured.', message: 'The service certificate could not be validated.', tone: 'service' },
  530: { title: 'The service is unavailable.', message: 'A routing or service configuration problem occurred.', tone: 'service' },
};

const CODE_COPY: Record<string, Partial<ErrorPresentation>> = {
  anime_not_found: { title: 'This anime could not be found.' },
  adult_content_hidden: { title: 'This title is hidden.', message: 'Your content preference currently hides this title.', tone: 'access' },
  episode_unreleased: { title: "This episode hasn't aired yet." },
  episode_unavailable: { title: "This episode isn't available yet." },
  release_status_unavailable: { title: 'Release status is temporarily unavailable.' },
  watch_session_expired: { title: 'Your watch link has expired.' },
  watch_session_invalid: { title: 'This watch link cannot be used.' },
  playback_unavailable: { title: "We couldn't load this episode." },
  offline: { title: "You're offline." },
  anilist_unavailable: { title: 'Anime metadata is temporarily unavailable.' },
};

export function errorPresentation(error: AppErrorState): ErrorPresentation {
  const fallback = STATUS_COPY[error.status] ?? STATUS_COPY[500];
  const override = CODE_COPY[error.code] ?? {};
  return {
    title: override.title ?? fallback.title,
    message: error.message ?? override.message ?? fallback.message,
    tone: override.tone ?? fallback.tone,
  };
}

