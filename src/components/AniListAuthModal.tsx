import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { X, ExternalLink, Key, User, LogOut, Check } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export const AniListAuthModal: React.FC<Props> = ({ onClose }) => {
  const {
    currentUser,
    oauthToken,
    initiateAniListOAuth,
    loginWithToken,
    logoutFromAniList,
    connectAniListUser,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'login' | 'token' | 'username'>('login');
  const [tokenInput, setTokenInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      const success = await loginWithToken(tokenInput.trim());
      if (success) {
        setStatusMessage({ text: 'Logged in successfully', type: 'success' });
        setTimeout(() => onClose(), 800);
      } else {
        setStatusMessage({ text: 'Invalid token. Please check and try again.', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Login failed', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) return;
    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      const res = await connectAniListUser(usernameInput.trim());
      if (res.success) {
        setStatusMessage({ text: `Connected profile: ${usernameInput.trim()}`, type: 'success' });
        setTimeout(() => onClose(), 800);
      } else {
        setStatusMessage({ text: res.error || 'User not found', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Connection failed', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn text-white">
      <div
        className="w-full max-w-md bg-[#121216] border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#02A9FF] flex items-center justify-center font-bold text-white text-base">
              AL
            </div>
            <h2 className="text-lg font-bold text-white">AniList Login</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {}
        {currentUser && (
          <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src={currentUser.avatar.medium || currentUser.avatar.large}
                alt={currentUser.name}
                className="w-10 h-10 rounded-full object-cover"
              />
              <div>
                <div className="text-sm font-bold text-white">{currentUser.name}</div>
                <div className="text-xs text-[#74cf66]">Logged in</div>
              </div>
            </div>
            <button
              onClick={logoutFromAniList}
              className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}

        {}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('login')}
            className={`py-2 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'login' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setActiveTab('token')}
            className={`py-2 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'token' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Token / PIN
          </button>
          <button
            onClick={() => setActiveTab('username')}
            className={`py-2 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'username' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Username
          </button>
        </div>

        {}
        {statusMessage && (
          <div
            className={`p-3 rounded-xl text-xs font-medium ${
              statusMessage.type === 'success'
                ? 'bg-[#74cf66]/15 text-[#74cf66] border border-[#74cf66]/30'
                : 'bg-red-500/15 text-red-400 border border-red-500/30'
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        {}
        {activeTab === 'login' && (
          <div className="space-y-4 pt-1">
            <p className="text-xs text-zinc-400">
              Sign in with your AniList account to sync your anime library, track episode progress, and update your watchlist automatically.
            </p>
            <button
              onClick={initiateAniListOAuth}
              className="w-full py-3 rounded-xl bg-[#02A9FF] hover:bg-[#0098e6] text-white font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Sign in with AniList</span>
            </button>
            <p className="text-[11px] text-zinc-500 text-center">
              You will be redirected to AniList to authorize Anilife.
            </p>
          </div>
        )}

        {}
        {activeTab === 'token' && (
          <form onSubmit={handleTokenSubmit} className="space-y-4 pt-1">
            <p className="text-xs text-zinc-400">
              Click <span className="text-white font-semibold">Sign in with AniList</span>, authorize the app, and paste your access token (`access_token=...`) or PIN here:
            </p>
            <div className="space-y-1">
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Paste token or PIN code"
                required
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-[#74cf66]"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting || !tokenInput.trim()}
              className="w-full py-2.5 rounded-xl bg-[#74cf66] hover:bg-[#62b956] text-black font-bold text-xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Verifying...' : 'Save Token'}
            </button>
          </form>
        )}

        {}
        {activeTab === 'username' && (
          <form onSubmit={handleUsernameSubmit} className="space-y-4 pt-1">
            <p className="text-xs text-zinc-400">
              Enter any public AniList username to view their anime collection without signing in:
            </p>
            <input
              type="text"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder="e.g. your_username"
              required
              className="w-full px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-[#74cf66]"
            />
            <button
              type="submit"
              disabled={isSubmitting || !usernameInput.trim()}
              className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Connecting...' : 'Connect Profile'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
