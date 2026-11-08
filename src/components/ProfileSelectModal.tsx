import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { UserProfile } from '../types/anime';
import { safeImageUrl } from '../utils/safeUrl';
import { POPULAR_AVATARS } from '../utils/storage';
import {
  X,
  Lock,
  Plus,
  Check,
  Edit2,
  Trash2,
  ArrowLeft,
  KeyRound,
  Shield
} from 'lucide-react';

interface Props {
  onClose: () => void;
}

export const ProfileSelectModal: React.FC<Props> = ({ onClose }) => {
  const {
    profiles,
    activeProfile,
    switchProfile,
    addProfile,
    updateProfile,
    deleteProfile
  } = useApp();

  const [mode, setMode] = useState<'select' | 'pin' | 'add' | 'edit'>('select');
  const [pinTargetProfile, setPinTargetProfile] = useState<UserProfile | null>(null);
  const [pinDigits, setPinDigits] = useState<string>('');
  const [pinError, setPinError] = useState(false);
  const [showPinHint, setShowPinHint] = useState(false);

  
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formAvatar, setFormAvatar] = useState(POPULAR_AVATARS[0].url);
  const [formAccent, setFormAccent] = useState('#74cf66');
  const [formPin, setFormPin] = useState('');
  const [formKidsMode, setFormKidsMode] = useState(false);
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');

  const colorSwatches = [
    '#74cf66', 
    '#3B82F6', 
    '#06B6D4', 
    '#10B981', 
    '#F59E0B', 
    '#D1102B', 
    '#F472B6', 
  ];

  const handleSelectProfile = (profile: UserProfile) => {
    if (profile.pin) {
      setPinTargetProfile(profile);
      setPinDigits('');
      setPinError(false);
      setShowPinHint(false);
      setMode('pin');
    } else {
      switchProfile(profile);
      onClose();
    }
  };

  const handleNumpad = (digit: string) => {
    if (pinDigits.length >= 4) return;
    const next = pinDigits + digit;
    setPinDigits(next);
    setPinError(false);

    if (next.length === 4) {
      if (pinTargetProfile && next === pinTargetProfile.pin) {
        switchProfile(pinTargetProfile);
        setPinTargetProfile(null);
        onClose();
      } else {
        setPinError(true);
        setTimeout(() => setPinDigits(''), 600);
      }
    }
  };

  const openAddProfile = () => {
    setFormName('');
    setFormAvatar(POPULAR_AVATARS[Math.floor(Math.random() * POPULAR_AVATARS.length)].url);
    setFormAccent('#74cf66');
    setFormPin('');
    setFormKidsMode(false);
    setCustomAvatarUrl('');
    setMode('add');
  };

  const openEditProfile = (profile: UserProfile) => {
    setEditingProfileId(profile.id);
    setFormName(profile.name);
    setFormAvatar(profile.avatar);
    setFormAccent(profile.accentColor || '#74cf66');
    setFormPin(profile.pin || '');
    setFormKidsMode(!!profile.isKidsMode);
    setCustomAvatarUrl('');
    setMode('edit');
  };

  const handleSaveAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const finalAvatar = customAvatarUrl.trim() || formAvatar;
    const created = addProfile(
      formName.trim() || 'New Viewer',
      finalAvatar,
      formAccent,
      formPin.trim() || undefined,
      formKidsMode
    );
    switchProfile(created);
    onClose();
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfileId) return;
    const finalAvatar = customAvatarUrl.trim() || formAvatar;
    updateProfile(editingProfileId, {
      name: formName.trim() || 'Viewer',
      avatar: finalAvatar,
      accentColor: formAccent,
      pin: formPin.trim() || undefined,
      isKidsMode: formKidsMode
    });
    setMode('select');
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this profile? All separate lists and settings will be removed.')) {
      deleteProfile(id);
      setMode('select');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-2xl animate-fadeIn text-white font-sans">
      <div
        className="w-full max-w-lg bg-[#0a0a0c] border border-[#74cf66]/30 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto no-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        {}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            {mode !== 'select' && (
              <button
                onClick={() => setMode('select')}
                className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h2 className="text-xl sm:text-2xl font-black">
                {mode === 'select' && "Who's watching?"}
                {mode === 'pin' && `${pinTargetProfile?.name} is locked`}
                {mode === 'add' && 'Create Profile'}
                {mode === 'edit' && 'Edit Profile'}
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                {mode === 'select' && 'Select your profile, switch viewers, or customize'}
                {mode === 'pin' && 'Enter your 4 digit PIN to unlock this profile'}
                {mode === 'add' && 'Create a profile with custom avatars and private lists'}
                {mode === 'edit' && 'Change name, avatar, color accent, or 4-digit PIN'}
              </p>
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
        {mode === 'select' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {profiles.map((prof) => {
                const isActive = activeProfile.id === prof.id;
                return (
                  <div
                    key={prof.id}
                    className="relative flex flex-col items-center gap-2 p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#74cf66]/50 transition-all group"
                  >
                    {}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditProfile(prof);
                      }}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 hover:bg-[#74cf66] text-zinc-400 hover:text-black transition-all opacity-0 group-hover:opacity-100 z-10 cursor-pointer"
                      title="Edit Profile"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleSelectProfile(prof)}
                      className="flex flex-col items-center gap-2 w-full cursor-pointer"
                    >
                      <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-[#74cf66]/40 p-0.5 group-hover:scale-105 transition-transform shadow-lg">
                        <img
                          src={prof.avatar}
                          alt={prof.name}
                          className="w-full h-full object-cover rounded-full"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = POPULAR_AVATARS[0].url;
                          }}
                        />
                        {prof.pin && (
                          <div className="absolute top-0 right-0 p-1.5 rounded-full bg-black/85 text-[#74cf66] shadow">
                            <Lock className="w-3.5 h-3.5" />
                          </div>
                        )}
                        {isActive && (
                          <div className="absolute inset-0 bg-[#74cf66]/60 flex items-center justify-center">
                            <Check className="w-7 h-7 text-black font-bold" />
                          </div>
                        )}
                      </div>

                      <div className="text-center">
                        <span className="font-bold text-sm text-white group-hover:text-[#74cf66] block truncate max-w-[110px]">
                          {prof.name}
                        </span>
                        {isActive && (
                          <span className="text-[10px] text-[#74cf66] font-medium">Active</span>
                        )}
                      </div>
                    </button>
                  </div>
                );
              })}

              {}
              <button
                onClick={openAddProfile}
                className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-dashed border-white/20 hover:border-[#74cf66] transition-all cursor-pointer group min-h-[140px]"
              >
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/20 group-hover:scale-105 transition-transform text-zinc-400 group-hover:text-[#74cf66]">
                  <Plus className="w-7 h-7" />
                </div>
                <span className="font-semibold text-xs text-zinc-400 group-hover:text-white">
                  Add Profile
                </span>
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between text-xs text-zinc-400">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#74cf66]" />
                <span>Profiles keep separate continue watching, lists & themes</span>
              </div>
            </div>
          </div>
        )}

        {}
        {mode === 'pin' && pinTargetProfile && (
          <div className="space-y-6 text-center animate-fadeIn">
            {}
            <div className="relative w-20 h-20 mx-auto">
              <img
                src={pinTargetProfile.avatar}
                alt={pinTargetProfile.name}
                className="w-full h-full object-cover rounded-full border-2 border-[#74cf66]/50 shadow-lg"
              />
              <div className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-[#74cf66] text-black shadow-md">
                <Lock className="w-4 h-4" />
              </div>
            </div>

            {}
            <div className="flex justify-center gap-4 py-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-200 ${
                    pinDigits.length > i
                      ? 'bg-[#74cf66] border-[#74cf66] scale-125 shadow-sm shadow-[rgba(116,207,102,0.5)]'
                      : pinError
                      ? 'border-red-500 bg-red-500/20 animate-shake'
                      : 'border-white/20 bg-white/5'
                  }`}
                />
              ))}
            </div>

            {pinError && (
              <p className="text-xs text-red-400 font-semibold animate-fadeIn">
                Incorrect PIN code. Try again.
              </p>
            )}

            {showPinHint && (
              <p className="text-xs text-[#74cf66] font-semibold animate-fadeIn bg-[#74cf66]/10 py-1.5 px-3 rounded-full border border-[#74cf66]/30">
                Hint: PIN is {pinTargetProfile.pin || '1234'}
              </p>
            )}

            {}
            <div className="grid grid-cols-3 gap-3 max-w-[260px] mx-auto pt-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((btn, idx) => {
                if (btn === '') return <div key={idx} />;
                if (btn === '⌫') {
                  return (
                    <button
                      key={btn}
                      onClick={() => setPinDigits(prev => prev.slice(0, -1))}
                      className="w-16 h-16 mx-auto rounded-full bg-white/5 hover:bg-white/15 text-zinc-300 font-bold text-lg flex items-center justify-center cursor-pointer transition-all active:scale-90 border border-white/5"
                    >
                      ⌫
                    </button>
                  );
                }
                return (
                  <button
                    key={btn}
                    onClick={() => handleNumpad(btn)}
                    className="w-16 h-16 mx-auto rounded-full bg-white/5 hover:bg-white/15 text-white font-bold text-xl flex items-center justify-center cursor-pointer transition-all active:scale-90 border border-white/5 hover:border-[#74cf66]/30"
                  >
                    {btn}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2 px-6 text-xs text-zinc-400">
              <button
                onClick={() => setShowPinHint(true)}
                className="hover:text-[#74cf66] transition-colors cursor-pointer"
              >
                Forgot PIN?
              </button>
              <button
                onClick={() => setMode('select')}
                className="hover:text-white transition-colors cursor-pointer"
              >
                Switch Profile
              </button>
            </div>
          </div>
        )}

        {}
        {(mode === 'add' || mode === 'edit') && (
          <form onSubmit={mode === 'add' ? handleSaveAdd : handleSaveEdit} className="space-y-5 animate-fadeIn">
            {}
            <div className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 border border-white/5">
              <img
                src={safeImageUrl(customAvatarUrl.trim() || formAvatar, POPULAR_AVATARS[0].url)}
                alt="Avatar"
                className="w-16 h-16 rounded-full object-cover border-2 shadow-md shrink-0"
                style={{ borderColor: formAccent }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = POPULAR_AVATARS[0].url;
                }}
              />
              <div className="min-w-0 flex-1">
                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  Profile Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Anime Fan, Guest"
                  required
                  maxLength={20}
                  className="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/10 text-white font-semibold text-sm focus:outline-none focus:border-[#74cf66]"
                />
              </div>
            </div>

            {}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  Pick Character Avatar
                </label>
                <span className="text-[10px] text-[#74cf66] font-medium">AniList Characters</span>
              </div>

              <div className="grid grid-cols-5 gap-2 max-h-36 overflow-y-auto no-scrollbar p-1 bg-black/30 rounded-2xl border border-white/5">
                {POPULAR_AVATARS.map((av) => {
                  const isSelected = formAvatar === av.url && !customAvatarUrl;
                  return (
                    <button
                      type="button"
                      key={av.name}
                      onClick={() => {
                        setFormAvatar(av.url);
                        setCustomAvatarUrl('');
                      }}
                      className={`relative aspect-square rounded-full overflow-hidden border-2 transition-transform cursor-pointer hover:scale-105 ${
                        isSelected ? 'border-[#74cf66] shadow-md shadow-[rgba(116,207,102,0.5)] scale-105' : 'border-white/10'
                      }`}
                      title={av.name}
                    >
                      <img src={av.url} alt={av.name} className="w-full h-full object-cover" />
                      {isSelected && (
                        <div className="absolute inset-0 bg-[#74cf66]/40 flex items-center justify-center">
                          <Check className="w-4 h-4 text-black font-bold" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                Or Custom Image URL
              </label>
              <input
                type="url"
                value={customAvatarUrl}
                onChange={(e) => setCustomAvatarUrl(e.target.value)}
                placeholder="https://.../avatar.png"
                className="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/10 text-white text-xs focus:outline-none focus:border-[#74cf66]"
              />
            </div>

            {}
            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                Profile Accent Colour
              </label>
              <div className="flex gap-2 items-center">
                {colorSwatches.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setFormAccent(col)}
                    className={`w-7 h-7 rounded-full transition-transform cursor-pointer ${
                      formAccent === col ? 'scale-125 ring-2 ring-white shadow-lg' : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: col }}
                  />
                ))}
              </div>
            </div>

            {}
            <div className="space-y-1.5 p-3 rounded-2xl bg-white/5 border border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[#74cf66]" />
                  <span className="text-xs font-bold text-white">4-Digit PIN Lock (Optional)</span>
                </div>
                {formPin && (
                  <button
                    type="button"
                    onClick={() => setFormPin('')}
                    className="text-[10px] text-red-400 hover:text-red-300 font-semibold"
                  >
                    Remove PIN
                  </button>
                )}
              </div>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={formPin}
                onChange={(e) => setFormPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Leave blank for no lock"
                className="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/10 text-white text-xs tracking-widest focus:outline-none focus:border-[#74cf66]"
              />
              <p className="text-[10px] text-zinc-400">
                Lock this profile so only viewers with this 4-digit PIN can access it.
              </p>
            </div>

            {}
            <div className="flex items-center justify-between pt-2">
              {mode === 'edit' && editingProfileId && profiles.length > 1 ? (
                <button
                  type="button"
                  onClick={() => handleDelete(editingProfileId)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-500/30 text-xs font-semibold cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Profile</span>
                </button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode('select')}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#74cf66] hover:bg-[#62b956] text-xs font-bold text-black shadow-lg shadow-[rgba(116,207,102,0.3)] cursor-pointer"
                >
                  {mode === 'add' ? 'Create Profile' : 'Save Changes'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};


