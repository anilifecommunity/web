import React, { useState } from 'react';
import { Check, Copy, Crown, LogOut, Play, Users } from 'lucide-react';
import type { WatchParty } from '../watchparty/useWatchParty';

interface Props {
  party: WatchParty;
  embedActive: boolean;
  animeId: string;
}

export const WatchPartyPanel: React.FC<Props> = ({ party, embedActive, animeId }) => {
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const busy = party.status === 'connecting';

  const copyLink = async () => {
    if (!party.code) return;
    const link = `${window.location.origin}/anime/${encodeURIComponent(animeId)}?party=${party.code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable */ }
  };

  if (party.status === 'off' || party.status === 'error' || !party.code) {
    return (
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-zinc-400">Watch together in sync. Share the invite link; friends open the anime and press Watch. The first person in the room controls playback.</p>
        <label className="block space-y-2">
          <span className="text-sm font-bold">Your name</span>
          <input value={party.name} onChange={(event) => party.setName(event.target.value)} maxLength={24} placeholder="Guest" className="anilife-select w-full" />
        </label>
        <button type="button" disabled={busy} onClick={() => void party.create()} className="anilife-button anilife-button-primary w-full disabled:opacity-50"><Users className="h-4 w-4" /> Create a room</button>
        <div className="space-y-2">
          <span className="text-sm font-bold">Have a code?</span>
          <div className="flex gap-2">
            <input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} maxLength={9} placeholder="ABC234" className="anilife-select min-w-0 flex-1 font-mono uppercase tracking-widest" aria-label="Room code" />
            <button type="button" disabled={busy || !joinCode.trim()} onClick={() => void party.join(joinCode)} className="anilife-button anilife-button-secondary disabled:opacity-50">Join</button>
          </div>
        </div>
        {party.error && <p className="text-sm font-semibold text-red-300" role="alert">{party.error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="anilife-eyebrow">Room code</p>
        <p className="mt-1 font-mono text-3xl font-bold tracking-widest">{party.code}</p>
        <button type="button" onClick={() => void copyLink()} className="anilife-button anilife-button-secondary mt-3">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Link copied' : 'Copy invite link'}</button>
      </div>

      {busy && <p className="text-sm text-zinc-400" role="status">Connecting…</p>}
      {party.needsTap && (
        <button type="button" onClick={party.resume} className="anilife-button anilife-button-primary w-full"><Play className="h-4 w-4" /> Tap to join playback</button>
      )}
      {embedActive && <p className="text-xs leading-relaxed text-zinc-500">This server uses an embedded player, so only episode changes are synced. Pick a server that plays directly for full sync.</p>}
      {!party.isHost && party.status === 'live' && <p className="text-xs leading-relaxed text-zinc-500">The host controls playback. Your player catches up automatically.</p>}

      <div>
        <p className="mb-2 text-sm font-bold">In this room ({party.members.length})</p>
        <ul className="space-y-1.5">
          {party.members.map((member) => (
            <li key={member.id} className="flex items-center justify-between border-b border-white/10 py-2 text-sm">
              <span className="truncate font-semibold">{member.name}{member.id === party.selfId ? ' (you)' : ''}</span>
              {member.id === party.hostId && <span className="flex items-center gap-1 text-xs text-zinc-400"><Crown className="h-3.5 w-3.5" /> Host</span>}
            </li>
          ))}
        </ul>
      </div>

      <button type="button" onClick={() => void party.leave()} className="anilife-button anilife-button-secondary w-full"><LogOut className="h-4 w-4" /> Leave room</button>
    </div>
  );
};
