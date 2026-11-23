import React from 'react';
import { useApp } from '../context/AppContext';
import { webServerOptions } from '../utils/providerOptions';
import { X, Check } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export const EnabledServersModal: React.FC<Props> = ({ onClose }) => {
  const { settings, updateSettings } = useApp();
  const servers = webServerOptions(settings.hideAdultContent);

  const configuredEnabled = (settings.enabledServers ?? [])
    .filter((id) => servers.some((server) => server.id === id));
  const enabledList = configuredEnabled.length > 0 ? configuredEnabled : servers.map(s => s.id);

  const totalServers = servers.length;
  const enabledCount = enabledList.length;

  const toggleServer = (serverId: string) => {
    if (enabledList.includes(serverId)) {
      if (enabledList.length <= 1) return; 
      updateSettings({
        enabledServers: enabledList.filter(id => id !== serverId)
      });
    } else {
      updateSettings({
        enabledServers: [...enabledList, serverId]
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex flex-col justify-end sm:items-center sm:justify-center bg-black/80 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#0e0c18] border border-white/10 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl flex flex-col max-h-[90vh] text-white animate-slideUp overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {}
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4 sm:hidden" />

        {}
        <div className="flex items-start justify-between pb-3">
          <div>
            <div className="text-[11px] font-bold text-[var(--anilife-accent)] tracking-widest uppercase">
              SERVERS
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Enabled servers
            </h2>
            <div className="text-xs text-zinc-400 font-medium mt-0.5">
              {enabledCount} of {totalServers} on
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {}
        <p className="text-[11px] text-zinc-400 leading-relaxed mb-4">
          A server that is off is never asked for episodes and never offered in the player. At least one has to stay on.
        </p>

        {}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar">
          {servers.map((server) => {
            const isChecked = enabledList.includes(server.id);
            return (
              <button
                type="button"
                key={server.id}
                onClick={() => toggleServer(server.id)}
                aria-pressed={isChecked}
                disabled={isChecked && enabledList.length <= 1}
                className={`flex w-full items-center justify-between px-4 py-3.5 rounded-2xl border transition-all cursor-pointer select-none disabled:cursor-not-allowed ${
                  isChecked
                    ? 'bg-[#181528] border-[var(--anilife-accent)]/30 hover:border-[var(--anilife-accent)]/50'
                    : 'bg-[#12101e]/60 border-white/5 opacity-60 hover:opacity-80'
                }`}
              >
                <span className="text-sm font-semibold text-white tracking-wide">
                  {server.name}
                </span>

                <div className="flex items-center gap-3">
                  {}
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                      isChecked
                        ? 'bg-[var(--anilife-accent)] text-black shadow-sm'
                        : 'border border-white/20 bg-transparent'
                    }`}
                  >
                    {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {}
        <div className="pt-4 mt-2 border-t border-white/10 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-2xl bg-[var(--anilife-accent)] hover:bg-[var(--anilife-accent-hover)] text-black font-bold text-xs sm:text-sm shadow-lg shadow-[var(--anilife-accent-shadow)] transition-all cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
