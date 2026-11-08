import React, { useState, useEffect } from 'react';
import { safeImageUrl } from '../utils/safeUrl';
import { useApp } from '../context/AppContext';
import {
  Home,
  Search,
  Calendar,
  Bookmark,
  Dices,
  Bell,
  Settings,
  Tv,
  MessageSquare
} from 'lucide-react';

export const HeaderNav: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    activeProfile,
    currentUser,
    setShowProfileModal,
    setShowSettingsModal,
    setShowRandomModal,
    setShowNotificationsModal,
    setShowAuthModal,
    settings,
  } = useApp();

  const [isMouseNearEdge, setIsMouseNearEdge] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  
  useEffect(() => {
    if (!settings.autoHideNav) {
      setIsMouseNearEdge(true);
      return;
    }

    let hideTimer: any = null;

    const handleMouseMove = (e: MouseEvent) => {
      if (settings.navigationLayout === 'sidebar') {
        if (e.clientX < 80) {
          setIsMouseNearEdge(true);
          clearTimeout(hideTimer);
        } else {
          clearTimeout(hideTimer);
          hideTimer = setTimeout(() => {
            setIsMouseNearEdge(false);
          }, 1200);
        }
      } else {
        if (e.clientY < 70) {
          setIsMouseNearEdge(true);
          clearTimeout(hideTimer);
        } else {
          clearTimeout(hideTimer);
          hideTimer = setTimeout(() => {
            setIsMouseNearEdge(false);
          }, 1200);
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(hideTimer);
    };
  }, [settings.autoHideNav, settings.navigationLayout]);

  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'schedule', label: 'Schedule', icon: Calendar },
    { id: 'mylist', label: 'Library', icon: Bookmark },
  ] as const;

  
  if (settings.navigationLayout === 'sidebar') {
    return (
      <aside
        onMouseEnter={() => {
          setIsMouseNearEdge(true);
          setIsExpanded(true);
        }}
        onMouseLeave={() => setIsExpanded(false)}
        className={`fixed left-0 top-0 bottom-0 z-40 bg-[#0e0e12] border-r border-zinc-800/80 flex flex-col justify-between py-4 px-2.5 transition-all duration-300 select-none ${
          settings.autoHideNav && !isMouseNearEdge ? '-translate-x-full' : 'translate-x-0'
        } ${isExpanded ? 'w-52 shadow-2xl' : 'w-16'}`}
      >
        {}
        <div className="space-y-6">
          {}
          <button
            onClick={() => setActiveTab('home')}
            className="flex items-center gap-3 px-1 py-1 rounded-xl w-full hover:bg-white/5 transition-colors cursor-pointer group"
            title="Anilife"
          >
            <img
              src="/assets/images/Anilife-Logo.png"
              alt="Anilife"
              className="w-10 h-10 rounded-full shrink-0 object-contain group-hover:scale-105 transition-transform"
            />
            {isExpanded && (
              <span className="font-black text-lg text-white tracking-wide truncate">
                Anilife
              </span>
            )}
          </button>

          {}
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  title={item.label}
                  className={`flex items-center gap-3.5 w-full p-2.5 rounded-xl transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#74cf66] text-black font-bold shadow-[0_0_12px_rgba(116,207,102,0.3)]'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  {isExpanded && (
                    <span className="text-xs font-semibold tracking-wide truncate">
                      {item.label}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {}
        <div className="space-y-2 pt-4 border-t border-zinc-800/80">
          <button
            onClick={() => setShowRandomModal(true)}
            className="flex items-center gap-3.5 w-full p-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            title="Random Anime Pick"
          >
            <Dices className="w-5 h-5 shrink-0 text-[#74cf66]" />
            {isExpanded && <span className="text-xs font-semibold truncate">Random</span>}
          </button>

          <button
            onClick={() => setShowNotificationsModal(true)}
            className="flex items-center gap-3.5 w-full p-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors relative cursor-pointer"
            title="Notifications"
          >
            <Bell className="w-5 h-5 shrink-0" />
            {isExpanded && <span className="text-xs font-semibold truncate">Notifications</span>}
          </button>

          <button
            onClick={() => setShowSettingsModal(true)}
            className="flex items-center gap-3.5 w-full p-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            title="Settings"
          >
            <Settings className="w-5 h-5 shrink-0" />
            {isExpanded && <span className="text-xs font-semibold truncate">Settings</span>}
          </button>

          {}
          <button
            onClick={() => setShowProfileModal(true)}
            className="flex items-center gap-3 w-full p-1.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
            title={`Profile: ${activeProfile.name}`}
          >
            <img
              src={safeImageUrl(activeProfile.avatar, '/assets/images/Anilife-Logo.png')}
              alt={activeProfile.name}
              className="w-8 h-8 rounded-full object-cover ring-2 ring-[#74cf66] shrink-0"
            />
            {isExpanded && (
              <div className="text-left min-w-0">
                <div className="text-xs font-bold text-white truncate">
                  {activeProfile.name}
                </div>
                <div className="text-[10px] text-zinc-500 truncate">
                  {currentUser ? currentUser.name : 'Switch profile'}
                </div>
              </div>
            )}
          </button>
        </div>
      </aside>
    );
  }

  
  return (
    <header
      className={`sticky top-0 z-40 w-full backdrop-blur-xl bg-black/70 border-b border-zinc-800/80 px-3 sm:px-6 py-2.5 transition-all duration-300 ${
        settings.autoHideNav && !isMouseNearEdge ? '-translate-y-full' : 'translate-y-0'
      }`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
        {}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          <button
            onClick={() => setActiveTab('home')}
            className="flex items-center gap-2.5 mr-3 select-none cursor-pointer group shrink-0"
            title="Anilife Home"
          >
            <img
              src="/assets/images/Anilife-Logo.png"
              alt="Anilife"
              className="w-8 h-8 rounded-full group-hover:scale-105 transition-transform object-cover"
            />
            <span className="hidden sm:inline-block text-lg font-black tracking-wider text-white">
              Anilife
            </span>
          </button>

          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#74cf66] text-black shadow-[0_0_12px_rgba(116,207,102,0.3)]'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setShowRandomModal(true)}
            title="Random anime pick"
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <Dices className="w-4 h-4 text-[#74cf66]" />
          </button>

          <button
            onClick={() => setShowNotificationsModal(true)}
            title="Notifications"
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <Bell className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowSettingsModal(true)}
            title="Settings"
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>

          {}
          <button
            onClick={() => setShowProfileModal(true)}
            title={`Profile: ${activeProfile.name}`}
            className="p-1 rounded-full hover:ring-2 hover:ring-[#74cf66] transition-all cursor-pointer ml-1"
          >
            <img
              src={safeImageUrl(activeProfile.avatar, '/assets/images/Anilife-Logo.png')}
              alt={activeProfile.name}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover"
            />
          </button>
        </div>
      </div>
    </header>
  );
};


