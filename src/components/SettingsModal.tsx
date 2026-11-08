import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { AppSettings, ThemePresetName } from '../types/anime';
import { SERVERS } from '../utils/animeData';
import { THEME_PRESETS } from '../utils/storage';
import {
  ArrowLeft,
  X,
  PlaySquare,
  Subtitles,
  UserCheck,
  Palette,
  Shield,
  Server,
  Database,
  Info,
  Check,
  RotateCcw,
  Download,
  Upload,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Layers,
  Sliders,
  Eye,
  EyeOff,
  LogOut,
  RefreshCw,
  ChevronRight,
  Play
} from 'lucide-react';
import { EnabledServersModal } from './EnabledServersModal';
import { applyBackup, buildBackupDocument, downloadBackup, parseBackup } from '../data/backup';

export const SettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const {
    settings,
    updateSettings,
    applyThemePreset,
    currentUser,
    oauthToken,
    setShowAuthModal,
    logoutFromAniList,
    syncAniList,
    isSyncingAniList,
    playIntroAnimation
  } = useApp();

  const [activeSection, setActiveSection] = useState<
    'appearance' | 'player' | 'subtitles' | 'servers' | 'accounts' | 'content' | 'data' | 'about'
  >('appearance');

  const [customBackdropUrl, setCustomBackdropUrl] = useState('');
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [showEnabledServersModal, setShowEnabledServersModal] = useState(false);

  const presetsList = Object.keys(THEME_PRESETS) as ThemePresetName[];

  const popularAnimeBackdrops = [
    { title: 'The Apothecary Diaries', url: 'https://image.tmdb.org/t/p/w1280/tka5fcGkFclwf3brgUZunXHIwAg.jpg' },
    { title: 'Dandadan', url: 'https://image.tmdb.org/t/p/w1280/dbkN1Nmj0pbL9sjjL0ePHzBtDZB.jpg' },
    { title: 'Frieren: Beyond Journey\'s End', url: 'https://image.tmdb.org/t/p/w1280/3PwfWIlXvHTrSCRFvQvHdaDRQiL.jpg' },
    { title: 'Jujutsu Kaisen', url: 'https://image.tmdb.org/t/p/w1280/9jPiGnf6EH7VVKm720vpk865Yqn.jpg' },
    { title: 'Demon Slayer', url: 'https://image.tmdb.org/t/p/w1280/GnIGBoBoniawSmEy4XWuzFwarO.jpg' },
    { title: 'Attack on Titan', url: 'https://image.tmdb.org/t/p/w1280/1v0d63laCR7iMSGBPREYHTE69IQ.jpg' },
  ];

  const handleExportData = async () => {
    try {
      const backup = await buildBackupDocument();
      downloadBackup(backup);
      showNotice('Backup exported');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Could not export backup');
    }
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = parseBackup(String(event.target?.result ?? ''));
        const summary = applyBackup(parsed);
        showNotice(
          `Restored ${summary.watchlist} saved, ${summary.history} continue watching, ${summary.settings} settings`
        );
        setTimeout(() => window.location.reload(), 1200);
      } catch (error) {
        showNotice(error instanceof Error ? error.message : 'Invalid backup file');
      }
    };
    reader.readAsText(file);
  };

  const showNotice = (msg: string) => {
    setDataMessage(msg);
    setTimeout(() => setDataMessage(null), 3000);
  };

  
  const moveServer = (index: number, direction: 'up' | 'down') => {
    const currentPriority = settings.serverPriority || SERVERS.map(s => s.id);
    const newIdx = direction === 'up' ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= currentPriority.length) return;
    const copy = [...currentPriority];
    const temp = copy[index];
    copy[index] = copy[newIdx];
    copy[newIdx] = temp;
    updateSettings({ serverPriority: copy });
  };

  const toggleServerEnabled = (serverId: string) => {
    const enabled = settings.enabledServers || SERVERS.map(s => s.id);
    if (enabled.includes(serverId)) {
      if (enabled.length <= 1) return; 
      updateSettings({ enabledServers: enabled.filter(id => id !== serverId) });
    } else {
      updateSettings({ enabledServers: [...enabled, serverId] });
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/90 backdrop-blur-2xl text-white animate-fadeIn flex flex-col font-sans">
      {}
      <div className="sticky top-0 z-20 flex items-center justify-between px-4 sm:px-8 py-3.5 bg-black/75 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-full hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black text-white capitalize">{activeSection}</h2>
            <span className="text-xs text-zinc-400 font-semibold">• Settings</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {dataMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-2 rounded-full bg-[#74cf66] text-black font-bold text-xs shadow-2xl shadow-[rgba(116,207,102,0.5)]">
          {dataMessage}
        </div>
      )}

      <div className="max-w-4xl w-full mx-auto p-4 sm:p-6 flex-1 flex flex-col md:flex-row gap-6">
        {}
        <div className="w-full md:w-56 shrink-0 flex md:flex-col gap-1.5 overflow-x-auto no-scrollbar pb-2 md:pb-0">
          {[
            { id: 'appearance', label: 'Appearance', icon: Palette },
            { id: 'player', label: 'Player', icon: PlaySquare },
            { id: 'subtitles', label: 'Subtitles & Audio', icon: Subtitles },
            { id: 'servers', label: 'Servers & Sources', icon: Server },
            { id: 'accounts', label: 'Accounts & Sync', icon: UserCheck },
            { id: 'content', label: 'Content', icon: Shield },
            { id: 'data', label: 'Data & Storage', icon: Database },
            { id: 'about', label: 'About', icon: Info },
          ].map((item) => {
            const Icon = item.icon;
            const isSelected = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id as any)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-[#74cf66] text-black shadow-md shadow-[rgba(116,207,102,0.3)]'
                    : 'bg-white/5 hover:bg-white/10 text-zinc-300'
                }`}
              >
                <Icon className={`w-4 h-4 ${isSelected ? 'text-black' : 'text-[#74cf66]'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {}
        <div className="flex-1 space-y-6">
          {}
          {}
          {}
          {activeSection === 'appearance' && (
            <div className="space-y-6 animate-fadeIn">
              {}
              <div className="p-5 rounded-3xl bg-[#14121e] border border-white/10 shadow-2xl space-y-4">
                <div className="flex items-center gap-2">
                  <span
                    className="px-3 py-1 rounded-full text-xs font-bold text-white shadow-md"
                    style={{ backgroundColor: settings.accentColor }}
                  >
                    Play
                  </span>
                  <span
                    className="px-3 py-1 rounded-full text-xs font-bold text-white/90"
                    style={{ backgroundColor: `${settings.accentColor}cc` }}
                  >
                    Save
                  </span>
                  <span className="px-3 py-1 rounded-full bg-white/10 text-xs font-bold text-zinc-300">
                    Sub
                  </span>
                  <span className="px-3 py-1 rounded-full bg-white/10 text-xs font-bold text-zinc-300">
                    Dub
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-bold text-white">
                    Theme: {settings.themePreset || 'Midnight'}
                  </div>
                  <div className="text-xs text-zinc-400">
                    Canvas: {settings.canvasBackground === 'amoled' ? 'AMOLED pure black (#000000)' : 'Dark gray (#121214)'}
                  </div>
                </div>
              </div>

              {}
              <div className="space-y-3">
                <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  THEME PRESETS (11 STYLES)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {presetsList.map((preset) => {
                    const isSelected = settings.themePreset === preset;
                    const meta = THEME_PRESETS[preset];
                    return (
                      <button
                        key={preset}
                        onClick={() => applyThemePreset(preset)}
                        className={`flex items-center gap-3 p-3 rounded-2xl text-left transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-[#74cf66]/20 border-[#74cf66] text-white shadow-lg'
                            : 'bg-white/5 hover:bg-white/10 border-white/5 text-zinc-300'
                        }`}
                      >
                        <div
                          className="w-5 h-5 rounded-full shrink-0 shadow-md ring-1 ring-white/20"
                          style={{ backgroundColor: meta.accent }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-xs truncate">{preset}</div>
                          <div className="text-[10px] text-zinc-400 capitalize">{meta.canvas}</div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-[#74cf66] shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  BACKGROUND CANVAS
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => updateSettings({ canvasBackground: 'amoled' })}
                    className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all ${
                      settings.canvasBackground === 'amoled'
                        ? 'bg-[#74cf66]/20 border-[#74cf66] text-white'
                        : 'bg-black/60 border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="font-bold text-xs">AMOLED Black</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">Pure #000000; pixels power off on OLED</div>
                  </button>

                  <button
                    onClick={() => updateSettings({ canvasBackground: 'dark' })}
                    className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all ${
                      settings.canvasBackground === 'dark'
                        ? 'bg-[#74cf66]/20 border-[#74cf66] text-white'
                        : 'bg-[#121214] border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="font-bold text-xs">Dark Gray</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">Material soft dark gray in lit rooms</div>
                  </button>
                </div>
              </div>

              {}
              <div className="space-y-3">
                <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  APP BACKDROP
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['none', 'anime', 'custom'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => updateSettings({ backdropSource: mode })}
                      className={`py-2 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer ${
                        settings.backdropSource === mode
                          ? 'bg-[#74cf66] text-black font-bold'
                          : 'bg-white/5 hover:bg-white/10 text-zinc-400'
                      }`}
                    >
                      {mode === 'none' ? 'None' : mode === 'anime' ? 'From Anime' : 'Custom URL'}
                    </button>
                  ))}
                </div>

                {settings.backdropSource === 'anime' && (
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {popularAnimeBackdrops.map((bd) => (
                      <button
                        key={bd.title}
                        onClick={() => updateSettings({ backdropImage: bd.url })}
                        className={`relative aspect-video rounded-xl overflow-hidden border transition-all cursor-pointer ${
                          settings.backdropImage === bd.url ? 'border-[#74cf66] ring-2 ring-[#74cf66]' : 'border-white/10'
                        }`}
                        title={bd.title}
                      >
                        <img src={bd.url} alt={bd.title} className="w-full h-full object-cover" />
                        <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/80 text-[8px] font-bold text-white truncate max-w-[90%]">
                          {bd.title}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {settings.backdropSource === 'custom' && (
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={customBackdropUrl}
                      onChange={(e) => setCustomBackdropUrl(e.target.value)}
                      placeholder="https://.../backdrop.jpg"
                      className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-xs text-white focus:outline-none focus:border-[#74cf66]"
                    />
                    <button
                      onClick={() => {
                        if (customBackdropUrl.trim()) {
                          updateSettings({ backdropImage: customBackdropUrl.trim() });
                          showNotice('Backdrop updated');
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-[#74cf66] text-xs font-bold text-black cursor-pointer"
                    >
                      Apply
                    </button>
                  </div>
                )}

                {settings.backdropSource !== 'none' && (
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                      <span className="text-[10px] text-zinc-400 font-bold uppercase">Backdrop Dim</span>
                      <div className="flex gap-1 mt-1">
                        {(['Light', 'Medium', 'Dark'] as const).map((dim) => (
                          <button
                            key={dim}
                            onClick={() => updateSettings({ backdropDim: dim })}
                            className={`flex-1 py-1 rounded-lg text-xs font-bold ${
                              settings.backdropDim === dim ? 'bg-[#74cf66] text-black font-bold' : 'bg-white/5 text-zinc-400'
                            }`}
                          >
                            {dim}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-zinc-400 font-bold uppercase">Backdrop Blur</span>
                      <div className="mt-1">
                        <button
                          onClick={() => updateSettings({ backdropBlur: !settings.backdropBlur })}
                          className={`w-full py-1 rounded-lg text-xs font-bold ${
                            settings.backdropBlur ? 'bg-[#74cf66] text-black font-bold' : 'bg-white/5 text-zinc-400'
                          }`}
                        >
                          {settings.backdropBlur ? 'Enabled (Smooth)' : 'Disabled (Sharp)'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {}
              <div className="space-y-3 pt-3 border-t border-white/10">
                <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  NAVIGATION & LAYOUT
                </div>

                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-4">
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-white">Layout Style</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => updateSettings({ navigationLayout: 'sidebar' })}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          settings.navigationLayout === 'sidebar'
                            ? 'bg-[#74cf66] text-black shadow-md'
                            : 'bg-white/5 text-zinc-400 hover:text-white'
                        }`}
                      >
                        Expandable Sidebar (Desktop)
                      </button>
                      <button
                        type="button"
                        onClick={() => updateSettings({ navigationLayout: 'topbar' })}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          settings.navigationLayout === 'topbar'
                            ? 'bg-[#74cf66] text-black shadow-md'
                            : 'bg-white/5 text-zinc-400 hover:text-white'
                        }`}
                      >
                        Top Navbar
                      </button>
                    </div>
                  </div>

                  <label className="flex items-center justify-between cursor-pointer pt-2 border-t border-white/5">
                    <div>
                      <div className="text-sm font-semibold text-white">Auto-hide navigation bar</div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        Automatically hide it when inactive, and show it when the mouse cursor approaches
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.autoHideNav}
                      onChange={(e) => updateSettings({ autoHideNav: e.target.checked })}
                      className="w-5 h-5 accent-[#74cf66] rounded cursor-pointer shrink-0"
                    />
                  </label>
                </div>
              </div>

              {}
              <div className="space-y-3 pt-3 border-t border-white/10">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-4">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        Show the AniLife animation when the app opens.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.playAppIntro}
                      onChange={(e) => updateSettings({ playAppIntro: e.target.checked })}
                      className="w-5 h-5 accent-[#74cf66] rounded cursor-pointer shrink-0"
                    />
                  </label>

                  {}
                  <div className="pt-3 border-t border-white/5 space-y-2">
                    <div className="text-sm font-bold text-white">
                      Title display language
                    </div>
                    <div className="text-xs text-zinc-400">
                      Choose which AniList title to show across browse, search, library and the player.
                    </div>
                    <div className="flex gap-2 pt-1">
                      {(['english', 'romaji', 'native'] as const).map((lang) => {
                        const isSelected = settings.titleLanguage === lang;
                        const label = lang === 'english' ? 'English' : lang === 'romaji' ? 'Romaji' : 'Native';
                        return (
                          <button
                            key={lang}
                            type="button"
                            onClick={() => updateSettings({ titleLanguage: lang })}
                            className={`px-5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                              isSelected
                                ? 'bg-[#74cf66] text-black border-[#74cf66] shadow-[0_0_12px_rgba(116,207,102,0.3)]'
                                : 'bg-transparent border-zinc-700 text-zinc-300 hover:border-zinc-500'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {}
          {}
          {}
          {activeSection === 'player' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="space-y-3">
                <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  PLAYBACK PREFERENCES
                </div>

                <label className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/5 cursor-pointer">
                  <div>
                    <div className="text-sm font-semibold text-white">Auto-play next episode</div>
                    <div className="text-xs text-zinc-400 mt-0.5">Automatically advances to next episode when current finishes</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.autoPlayNext}
                    onChange={(e) => updateSettings({ autoPlayNext: e.target.checked })}
                    className="w-5 h-5 accent-[#74cf66] rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/5 cursor-pointer">
                  <div>
                    <div className="text-sm font-semibold text-white">Auto-skip intro, recap and outro</div>
                    <div className="text-xs text-zinc-400 mt-0.5">Community skip timestamps provided by AniSkip and media-index</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.autoSkipIntro}
                    onChange={(e) => updateSettings({ autoSkipIntro: e.target.checked })}
                    className="w-5 h-5 accent-[#74cf66] rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/5 cursor-pointer">
                  <div>
                    <div className="text-sm font-semibold text-white">Auto-skip filler episodes</div>
                    <div className="text-xs text-zinc-400 mt-0.5">Bypasses anime non-canon filler arcs automatically</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.skipFiller}
                    onChange={(e) => updateSettings({ skipFiller: e.target.checked })}
                    className="w-5 h-5 accent-[#74cf66] rounded cursor-pointer"
                  />
                </label>
              </div>

              {}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Default Quality</span>
                  <select
                    value={settings.defaultQuality}
                    onChange={(e) => updateSettings({ defaultQuality: e.target.value as any })}
                    className="w-full p-2.5 rounded-xl bg-black/60 border border-white/10 text-xs font-semibold text-white focus:outline-none focus:border-[#74cf66]"
                  >
                    <option value="Auto">Auto (Adaptive)</option>
                    <option value="1080p">1080p Full HD</option>
                    <option value="720p">720p HD</option>
                    <option value="480p">480p SD</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Screen Fit</span>
                  <select
                    value={settings.screenFit}
                    onChange={(e) => updateSettings({ screenFit: e.target.value as any })}
                    className="w-full p-2.5 rounded-xl bg-black/60 border border-white/10 text-xs font-semibold text-white focus:outline-none focus:border-[#74cf66]"
                  >
                    <option value="Fit">Fit (Aspect Ratio)</option>
                    <option value="Crop">Crop (Zoom to Fill)</option>
                    <option value="Fill">Fill (Stretch)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {}
          {}
          {}
          {activeSection === 'subtitles' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="space-y-3">
                <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  AUDIO & SUBTITLE DEFAULTS
                </div>

                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5 space-y-2">
                  <div className="text-sm font-semibold text-white">Default Audio Mode</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => updateSettings({ defaultAudioMode: 'SUB' })}
                      className={`py-2 rounded-xl text-xs font-bold ${
                        settings.defaultAudioMode === 'SUB' ? 'bg-[#74cf66] text-black font-bold' : 'bg-white/5 text-zinc-400'
                      }`}
                    >
                      Japanese (Sub)
                    </button>
                    <button
                      onClick={() => updateSettings({ defaultAudioMode: 'DUB' })}
                      className={`py-2 rounded-xl text-xs font-bold ${
                        settings.defaultAudioMode === 'DUB' ? 'bg-[#74cf66] text-black font-bold' : 'bg-white/5 text-zinc-400'
                      }`}
                    >
                      English / Localized (Dub)
                    </button>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5 space-y-2">
                  <div className="text-sm font-semibold text-white">Preferred Subtitle Language</div>
                  <select
                    value={settings.preferredSubLanguage}
                    onChange={(e) => updateSettings({ preferredSubLanguage: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-black/60 border border-white/10 text-xs font-semibold text-white focus:outline-none"
                  >
                    <option value="English">English</option>
                    <option value="Spanish">Spanish (Español)</option>
                    <option value="French">French (Français)</option>
                    <option value="German">German (Deutsch)</option>
                    <option value="Portuguese">Portuguese (Português)</option>
                    <option value="Italian">Italian (Italiano)</option>
                  </select>
                </div>

                <label className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/5 cursor-pointer">
                  <div>
                    <div className="text-sm font-semibold text-white">Subtitles on Dub</div>
                    <div className="text-xs text-zinc-400 mt-0.5">Keep closed captions on when watching dubbed audio</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.subtitlesOnDub}
                    onChange={(e) => updateSettings({ subtitlesOnDub: e.target.checked })}
                    className="w-5 h-5 accent-[#74cf66] rounded cursor-pointer"
                  />
                </label>
              </div>
            </div>
          )}

          {}
          {}
          {}
          {activeSection === 'servers' && (
            <div className="space-y-4 animate-fadeIn">
              {}
              <div
                onClick={() => setShowEnabledServersModal(true)}
                className="flex items-center justify-between p-4 rounded-2xl bg-[#74cf66]/10 border border-[#74cf66]/30 hover:border-[#74cf66]/50 transition-all cursor-pointer shadow-lg"
              >
                <div>
                  <div className="text-[11px] font-bold text-[#74cf66] uppercase tracking-wider">
                    SERVERS
                  </div>
                  <div className="text-base font-bold text-white mt-0.5">Enabled servers</div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    {(settings.enabledServers && settings.enabledServers.length > 0 ? settings.enabledServers : SERVERS.map(s => s.id)).length} of {SERVERS.length} on
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#74cf66] hidden sm:inline">Configure</span>
                  <ChevronRight className="w-5 h-5 text-[#74cf66]" />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div>
                  <h3 className="text-sm font-bold text-white">Provider Priority Order</h3>
                  <p className="text-xs text-zinc-400">Order determines stream lookup and automatic failover</p>
                </div>
                <button
                  onClick={() => {
                    updateSettings({
                      serverPriority: SERVERS.map(s => s.id),
                      enabledServers: SERVERS.map(s => s.id)
                    });
                    showNotice('Reset server order to defaults');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-zinc-300 font-semibold cursor-pointer"
                >
                  Reset Order
                </button>
              </div>

              <div className="space-y-2">
                {(settings.serverPriority || SERVERS.map(s => s.id)).map((serverId, idx) => {
                  const server = SERVERS.find(s => s.id === serverId);
                  if (!server) return null;
                  const isEnabled = (settings.enabledServers || []).includes(serverId);
                  const isDefault = settings.activeServer === serverId;

                  return (
                    <div
                      key={serverId}
                      className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                        isDefault
                          ? 'bg-[#74cf66]/20 border-[#74cf66]/60'
                          : isEnabled
                          ? 'bg-white/5 border-white/5'
                          : 'bg-black/40 border-white/5 opacity-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="w-5 text-center text-xs font-mono text-zinc-500">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-white truncate">{server.name}</span>
                            {server.badge && (
                              <span className="px-2 py-0.2 rounded-full bg-[#74cf66]/20 text-[9px] font-bold text-[#74cf66]">
                                {server.badge}
                              </span>
                            )}
                            {isDefault && (
                              <span className="text-[10px] text-[#74cf66] font-bold">Active Server</span>
                            )}
                          </div>
                          <p className="text-[10px] text-zinc-400 line-clamp-1">{server.description}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 pl-2">
                        {}
                        {!isDefault && isEnabled && (
                          <button
                            onClick={() => updateSettings({ activeServer: serverId })}
                            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-semibold text-zinc-300 cursor-pointer"
                          >
                            Set Default
                          </button>
                        )}

                        {}
                        <button
                          onClick={() => moveServer(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 disabled:opacity-20 cursor-pointer"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => moveServer(idx, 'down')}
                          disabled={idx === (settings.serverPriority || []).length - 1}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 disabled:opacity-20 cursor-pointer"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>

                        {}
                        <button
                          onClick={() => toggleServerEnabled(serverId)}
                          className={`p-1.5 rounded-lg cursor-pointer ${
                            isEnabled ? 'bg-[#74cf66]/30 text-[#74cf66]' : 'bg-zinc-800 text-zinc-500'
                          }`}
                          title={isEnabled ? 'Disable provider' : 'Enable provider'}
                        >
                          {isEnabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {}
          {}
          {}
          {activeSection === 'accounts' && (
            <div className="space-y-5 animate-fadeIn">
              {}
              <div className="p-5 rounded-3xl bg-zinc-900/60 border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={currentUser?.avatar?.large || 'https://anilist.co/img/icons/icon.svg'}
                      alt="AniList"
                      className="w-12 h-12 rounded-full object-cover border-2 border-[#74cf66]"
                    />
                    <div>
                      <h3 className="font-bold text-sm text-white">
                        {currentUser?.name ? `@${currentUser.name}` : 'AniList Account'}
                      </h3>
                      <p className="text-xs text-zinc-400">
                        {oauthToken ? 'Signed in with Client 55798' : 'Not signed in'}
                      </p>
                    </div>
                  </div>

                  {oauthToken ? (
                    <button
                      onClick={logoutFromAniList}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-950/40 text-red-300 border border-red-500/30 text-xs font-semibold hover:bg-red-900/50 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Disconnect</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowAuthModal(true)}
                      className="px-4 py-2 rounded-xl bg-[#74cf66] hover:bg-[#62b956] text-black font-bold text-xs shadow-md shadow-[#74cf66]/20 cursor-pointer"
                    >
                      AniList Login
                    </button>
                  )}
                </div>

                {oauthToken && (
                  <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
                    <span className="text-zinc-400">Syncs watched episodes directly to your list</span>
                    <button
                      onClick={syncAniList}
                      disabled={isSyncingAniList}
                      className="flex items-center gap-1.5 text-[#74cf66] hover:text-white font-bold cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAniList ? 'animate-spin' : ''}`} />
                      <span>{isSyncingAniList ? 'Syncing...' : 'Sync Now'}</span>
                    </button>
                  </div>
                )}
              </div>

              {}
              <div className="p-5 rounded-3xl bg-zinc-900/60 border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#5865F2]/20 border border-[#5865F2]/40 flex items-center justify-center text-[#5865F2] font-black text-xl">
                      D
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-white">
                        {settings.discordConnected && settings.discordUsername
                          ? settings.discordUsername
                          : 'Discord Integration'}
                      </h3>
                      <p className="text-xs text-zinc-400">
                        {settings.discordConnected ? 'Linked' : 'Rich Presence Status'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (settings.discordConnected) {
                        updateSettings({
                          discordConnected: false,
                          discordUsername: undefined,
                          discordAvatar: undefined
                        });
                        showNotice('Discord disconnected');
                      } else {
                        updateSettings({
                          discordConnected: true,
                          discordUsername: 'AniLifeUser#0001'
                        });
                        showNotice('Discord linked successfully');
                      }
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      settings.discordConnected
                        ? 'bg-zinc-800 text-zinc-300 hover:text-white'
                        : 'bg-[#5865F2] hover:bg-[#4752c4] text-white'
                    }`}
                  >
                    {settings.discordConnected ? 'Disconnect' : 'Link Discord'}
                  </button>
                </div>

                <label className="flex items-center justify-between pt-3 border-t border-white/5 cursor-pointer">
                  <div>
                    <div className="text-xs font-semibold text-white">
                      Show watching anime on Discord status
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      Broadcasts currently playing anime, episode number, and timestamp to Discord Rich Presence
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.discordRichPresence}
                    onChange={(e) => updateSettings({ discordRichPresence: e.target.checked })}
                    className="w-5 h-5 accent-[#74cf66] rounded cursor-pointer"
                  />
                </label>
              </div>
            </div>
          )}

          {}
          {}
          {}
          {activeSection === 'content' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                CATALOGUE FILTERING
              </div>

              <label className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/5 cursor-pointer">
                <div>
                  <div className="text-sm font-semibold text-white">Hide Adult (18+) Content</div>
                  <div className="text-xs text-zinc-400 mt-0.5">Filter out explicit anime entries and adult servers</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.hideAdultContent}
                  onChange={(e) => updateSettings({ hideAdultContent: e.target.checked })}
                  className="w-5 h-5 accent-purple-500 rounded cursor-pointer"
                />
              </label>

              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5 space-y-2">
                <div className="text-sm font-semibold text-white">Preferred Title Display</div>
                <div className="grid grid-cols-3 gap-2">
                  {(['english', 'romaji', 'native'] as const).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => updateSettings({ titleLanguage: lang })}
                      className={`py-2 rounded-xl text-xs font-bold capitalize ${
                        settings.titleLanguage === lang ? 'bg-[#74cf66] text-black font-bold' : 'bg-white/5 text-zinc-400'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/5 cursor-pointer">
                <div>
                  <div className="text-sm font-semibold text-white">Blur Spoilers in Overviews</div>
                  <div className="text-xs text-zinc-400 mt-0.5">Blurs episode summaries until hovered or tapped</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.blurSpoilers}
                  onChange={(e) => updateSettings({ blurSpoilers: e.target.checked })}
                  className="w-5 h-5 accent-purple-500 rounded cursor-pointer"
                />
              </label>
            </div>
          )}

          {}
          {}
          {}
          {activeSection === 'data' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                BACKUP & RECOVERY
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleExportData}
                  className="flex items-center justify-center gap-2 p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white cursor-pointer"
                >
                  <Download className="w-4 h-4 text-[#74cf66]" />
                  <span>Export Backup JSON</span>
                </button>

                <label className="flex items-center justify-center gap-2 p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white cursor-pointer">
                  <Upload className="w-4 h-4 text-[#74cf66]" />
                  <span>Import Backup JSON</span>
                  <input type="file" accept=".json" onChange={handleImportData} className="hidden" />
                </label>
              </div>

              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">Reset Local Cache</div>
                  <div className="text-xs text-zinc-400">Clears cached anime catalogue and skip timings</div>
                </div>
                <button
                  onClick={() => {
                    localStorage.removeItem('anilife_live_catalog_cache_v3');
                    localStorage.removeItem('anilife_live_catalog_cache_v2');
                    showNotice('Cache cleared. Reloading catalogue...');
                    setTimeout(() => window.location.reload(), 1000);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-zinc-300 cursor-pointer"
                >
                  Clear Cache
                </button>
              </div>
            </div>
          )}

          {}
          {}
          {}
          {activeSection === 'about' && (
            <div className="space-y-5 animate-fadeIn text-xs">
              <div className="p-5 rounded-3xl bg-zinc-900/60 border border-zinc-800 space-y-4">
                <div className="flex items-center gap-3.5">
                  <img
                    src="/assets/images/Anilife-Logo.png"
                    alt="AniLife Logo"
                    className="w-12 h-12 rounded-full ring-2 ring-[#74cf66] object-cover"
                  />
                  <div>
                    <h3 className="text-base font-black text-white tracking-wide">AniLife</h3>
                    <p className="text-xs text-[#74cf66]">Version 3.0.0 • Community Edition</p>
                  </div>
                </div>

                <div className="space-y-3 text-zinc-300 leading-relaxed text-xs pt-2 border-t border-white/10">
                  <p>
                    Anilife is a community-driven anime platform built to make watching anime simple and enjoyable. It discovers episodes across multiple sources, remembers where you left off, and keeps your anime library synchronised with AniList and MyAnimeList.
                  </p>
                  <p>
                    No unnecessary ads, no account required. Just anime, the way it should be.
                  </p>
                  <p className="text-[#74cf66] font-semibold pt-1">
                    ♡ Built with passion by the Anilife Team
                  </p>
                </div>
              </div>

              {}
              <div className="space-y-3">
                <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  OFFICIAL APP DOWNLOADS
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { name: 'Android APK', desc: 'Mobile & Tablet App', badge: 'Coming Soon' },
                    { name: 'Android TV', desc: 'Smart TV Edition', badge: 'Coming Soon' },
                    { name: 'Desktop (Windows)', desc: 'Standalone App', badge: 'Coming Soon' },
                    { name: 'iOS App', desc: 'iPhone & iPad', badge: 'Coming Soon' },
                    { name: 'macOS', desc: 'Apple Silicon & Intel', badge: 'Coming Soon' },
                    { name: 'Linux', desc: 'AppImage & Flatpak', badge: 'Coming Soon' },
                  ].map((app) => (
                    <div
                      key={app.name}
                      className="p-3.5 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-white text-xs">{app.name}</div>
                        <div className="text-[10px] text-zinc-400">{app.desc}</div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 text-[10px] font-semibold">
                        {app.badge}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <a
                  href="https://github.com/anilifecommunity/media-index"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-300 hover:text-white"
                >
                  <div className="flex items-center gap-2.5">
                    <Database className="w-4 h-4 text-[#74cf66]" />
                    <span className="font-semibold">anilifecommunity/media-index</span>
                  </div>
                  <ExternalLink className="w-4 h-4 text-zinc-500" />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {}
      {showEnabledServersModal && (
        <EnabledServersModal onClose={() => setShowEnabledServersModal(false)} />
      )}
    </div>
  );
};
