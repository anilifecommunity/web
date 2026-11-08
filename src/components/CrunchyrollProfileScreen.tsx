import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { UserProfile } from '../types/anime';
import { POPULAR_AVATARS } from '../utils/storage';
import { Plus, Lock, Check, Edit2, Trash2, ArrowLeft, KeyRound } from 'lucide-react';

interface Props {
  onSelectProfile: () => void;
}

export const CrunchyrollProfileScreen: React.FC<Props> = ({ onSelectProfile }) => {
  const {
    profiles,
    switchProfile,
    addProfile,
    updateProfile,
    deleteProfile
  } = useApp();

  const [mode, setMode] = useState<'view' | 'manage' | 'add' | 'edit' | 'pin'>('view');
  const [targetPinProfile, setTargetPinProfile] = useState<UserProfile | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [avatarInput, setAvatarInput] = useState(POPULAR_AVATARS[0].url);
  const [pinCode, setPinCode] = useState('');

  const handlePick = (p: UserProfile) => {
    if (p.pin) {
      setTargetPinProfile(p);
      setPinInput('');
      setPinError(false);
      setMode('pin');
    } else {
      switchProfile(p);
      onSelectProfile();
    }
  };

  const handlePinDigit = (digit: string) => {
    if (pinInput.length >= 4) return;
    const next = pinInput + digit;
    setPinInput(next);
    setPinError(false);

    if (next.length === 4) {
      if (targetPinProfile && next === targetPinProfile.pin) {
        switchProfile(targetPinProfile);
        onSelectProfile();
      } else {
        setPinError(true);
        setTimeout(() => setPinInput(''), 600);
      }
    }
  };

  const startAdd = () => {
    setNameInput('');
    const nextAvatar = POPULAR_AVATARS[profiles.length % POPULAR_AVATARS.length];
    setAvatarInput(nextAvatar.url);
    setPinCode('');
    setMode('add');
  };

  const startEdit = (p: UserProfile) => {
    setEditingId(p.id);
    setNameInput(p.name);
    setAvatarInput(p.avatar);
    setPinCode(p.pin || '');
    setMode('edit');
  };

  const saveAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    addProfile(nameInput.trim(), avatarInput, '#74cf66', pinCode.trim() || undefined);
    setMode('view');
  };

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !nameInput.trim()) return;
    updateProfile(editingId, {
      name: nameInput.trim(),
      avatar: avatarInput,
      pin: pinCode.trim() || undefined
    });
    setMode('view');
  };

  return (
    <div className="fixed inset-0 z-[150] bg-[#000000] text-white flex flex-col items-center justify-center p-4 sm:p-8 select-none">
      {}
      <div className="absolute top-8 left-8 flex items-center gap-3">
        <img
          src="/assets/images/Anilife-Logo.png"
          alt="Anilife"
          className="w-8 h-8 rounded-full"
        />
        <span className="text-xl font-bold tracking-tight text-white">
          Anilife
        </span>
      </div>

      {}
      {(mode === 'view' || mode === 'manage') && (
        <div className="w-full max-w-4xl flex flex-col items-center text-center space-y-10 animate-fadeIn">
          <div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight">
              {mode === 'manage' ? 'Manage Profiles' : "Who's watching?"}
            </h1>
            <p className="text-sm text-zinc-400 mt-2">
              {mode === 'manage'
                ? 'Select a profile to edit its name, avatar, or PIN'
                : 'Select your profile to continue watching your anime'}
            </p>
          </div>

          {}
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8 max-w-3xl">
            {profiles.map((p) => (
              <div key={p.id} className="flex flex-col items-center space-y-3 group">
                <button
                  onClick={() => (mode === 'manage' ? startEdit(p) : handlePick(p))}
                  className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-2xl overflow-hidden bg-zinc-900 border-2 border-transparent transition-all duration-200 group-hover:scale-105 group-hover:border-[#74cf66] group-hover:shadow-[0_0_20px_rgba(116,207,102,0.3)] cursor-pointer"
                >
                  <img
                    src={p.avatar}
                    alt={p.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = POPULAR_AVATARS[0].url;
                    }}
                  />
                  {p.pin && (
                    <div className="absolute top-2 right-2 p-1.5 rounded-full bg-black/80 text-[#74cf66]">
                      <Lock className="w-3.5 h-3.5" />
                    </div>
                  )}
                  {mode === 'manage' && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <Edit2 className="w-6 h-6 text-white" />
                    </div>
                  )}
                </button>
                <span className="text-sm sm:text-base font-semibold text-zinc-300 group-hover:text-white transition-colors">
                  {p.name}
                </span>
              </div>
            ))}

            {}
            {profiles.length < 6 && (
              <div className="flex flex-col items-center space-y-3 group">
                <button
                  onClick={startAdd}
                  className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl bg-zinc-900/60 border-2 border-dashed border-zinc-700 hover:border-[#74cf66] flex items-center justify-center text-zinc-400 hover:text-white transition-all duration-200 group-hover:scale-105 cursor-pointer"
                >
                  <Plus className="w-8 h-8 sm:w-10 sm:h-10" />
                </button>
                <span className="text-sm sm:text-base font-semibold text-zinc-400 group-hover:text-white transition-colors">
                  Add Profile
                </span>
              </div>
            )}
          </div>

          {}
          <div className="pt-6">
            <button
              onClick={() => setMode(mode === 'manage' ? 'view' : 'manage')}
              className="px-6 py-2.5 rounded-xl border border-zinc-700 hover:border-[#74cf66] text-xs sm:text-sm font-semibold text-zinc-300 hover:text-white tracking-wide transition-all cursor-pointer"
            >
              {mode === 'manage' ? 'Done' : 'Manage Profiles'}
            </button>
          </div>
        </div>
      )}

      {}
      {mode === 'pin' && targetPinProfile && (
        <div className="w-full max-w-sm flex flex-col items-center text-center space-y-6 animate-fadeIn">
          <button
            onClick={() => setMode('view')}
            className="self-start text-xs font-semibold text-zinc-400 hover:text-white flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <img
            src={targetPinProfile.avatar}
            alt={targetPinProfile.name}
            className="w-24 h-24 rounded-2xl object-cover ring-2 ring-[#74cf66]"
          />
          <div>
            <h2 className="text-xl font-bold text-white">Enter Profile PIN</h2>
            <p className="text-xs text-zinc-400 mt-1">{targetPinProfile.name} is locked with a PIN</p>
          </div>

          {}
          <div className={`flex gap-3 my-2 ${pinError ? 'animate-shake' : ''}`}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full border transition-all ${
                  pinInput.length > i
                    ? 'bg-[#74cf66] border-[#74cf66]'
                    : pinError
                    ? 'border-red-500 bg-red-500/20'
                    : 'border-zinc-700 bg-zinc-900'
                }`}
              />
            ))}
          </div>

          {}
          <div className="grid grid-cols-3 gap-3 w-56">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                onClick={() => handlePinDigit(digit)}
                className="w-16 h-16 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-lg font-bold text-white transition-all cursor-pointer"
              >
                {digit}
              </button>
            ))}
            <div />
            <button
              onClick={() => handlePinDigit('0')}
              className="w-16 h-16 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-lg font-bold text-white transition-all cursor-pointer"
            >
              0
            </button>
            <button
              onClick={() => setPinInput((prev) => prev.slice(0, -1))}
              className="w-16 h-16 rounded-xl bg-zinc-900/60 hover:bg-zinc-800 text-xs font-semibold text-zinc-400 hover:text-white transition-all cursor-pointer"
            >
              DEL
            </button>
          </div>
        </div>
      )}

      {}
      {(mode === 'add' || mode === 'edit') && (
        <div className="w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 animate-fadeIn">
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
            <h2 className="text-xl font-bold text-white">
              {mode === 'add' ? 'Create Profile' : 'Edit Profile'}
            </h2>
            <button
              onClick={() => setMode('view')}
              className="text-xs font-semibold text-zinc-400 hover:text-white cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={mode === 'add' ? saveAdd : saveEdit} className="space-y-5">
            {}
            <div className="flex items-center gap-4">
              <img
                src={avatarInput}
                alt="Selected"
                className="w-20 h-20 rounded-2xl object-cover ring-2 ring-[#74cf66]"
                onError={(e) => {
                  e.currentTarget.src = POPULAR_AVATARS[0].url;
                }}
              />
              <div className="flex-1 space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
                  Profile Name
                </label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Enter name"
                  maxLength={24}
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-[#74cf66]"
                />
              </div>
            </div>

            {}
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
                Choose Anime Avatar
              </label>
              <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 max-h-48 overflow-y-auto p-1 border border-zinc-900 rounded-xl bg-zinc-900/40">
                {POPULAR_AVATARS.map((av) => (
                  <button
                    key={av.name}
                    type="button"
                    onClick={() => setAvatarInput(av.url)}
                    className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                      avatarInput === av.url ? 'border-[#74cf66] scale-95' : 'border-transparent hover:border-zinc-700'
                    }`}
                    title={av.name}
                  >
                    <img src={av.url} alt={av.name} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            {}
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-[#74cf66]" />
                Profile PIN (Optional 4 Digits)
              </label>
              <input
                type="password"
                maxLength={4}
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 1234 (leave blank for none)"
                className="w-full px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-[#74cf66]"
              />
            </div>

            {}
            <div className="pt-4 flex items-center justify-between">
              {mode === 'edit' && editingId && profiles.length > 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    deleteProfile(editingId);
                    setMode('view');
                  }}
                  className="px-4 py-2 rounded-xl bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Delete Profile
                </button>
              ) : <div />}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode('view')}
                  className="px-5 py-2 rounded-xl bg-zinc-900 text-xs font-bold text-zinc-300 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-[#74cf66] hover:bg-[#62b956] text-black text-xs font-bold transition-all shadow-[0_0_15px_rgba(116,207,102,0.3)] cursor-pointer"
                >
                  Save Profile
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

