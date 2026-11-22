# Watch party

Synced playback over Supabase Realtime (Broadcast + Presence). No tables or accounts needed.

## Setup
- `.env.production` holds the project URL and the publishable key, which are public by design. Never put the secret key in a `VITE_` variable. For local dev, copy the same two lines into `.env.local`. The player button stays hidden until both are set.
- `worker/security.ts` already allows `*.supabase.co` in `connect-src`.

## Behaviour
- One channel per room code (`w2g:<CODE>`). The oldest member is the host and the only one who broadcasts play, pause, seek and a 4 second heartbeat. If the host leaves, the next oldest takes over.
- Guests seek when more than 1.5 s off (0.5 s while paused). If autoplay is blocked, the panel shows a button to start playback.
- Invite links are `/anime/<id>?party=CODE`; `main.tsx` keeps the code before the router rewrites the URL.
- Rooms hold 10 people. Embedded iframe servers can't be controlled, so only episode changes sync there.
- Supabase free tier: 200 concurrent connections, 100 messages per second.
