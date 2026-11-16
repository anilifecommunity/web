import React, { useState, useEffect } from 'react';

interface AppIntroProps {
  onFinish: () => void;
}

export const AppIntro: React.FC<AppIntroProps> = ({ onFinish }) => {
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [imgSrc, setImgSrc] = useState('/assets/images/Anilife-Animated-Logo-V4.gif');

  useEffect(() => {
    const finishTimer = window.setTimeout(() => {
      setIsFadingOut(true);
      window.setTimeout(() => {
        try {
          sessionStorage.setItem('anilife_intro_seen', '1');
        } catch {}
        onFinish();
      }, 350);
    }, 2200);

    return () => window.clearTimeout(finishTimer);
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center transition-opacity duration-300 select-none ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center justify-center space-y-6">
        {}
        <div className="relative w-40 h-40 sm:w-48 sm:h-48 flex items-center justify-center">
          <img
            src={imgSrc}
            onError={() => {
              
              setImgSrc('/assets/images/Anilife-Logo.png');
            }}
            alt="Anilife"
            className="w-full h-full object-contain filter drop-shadow-[0_0_20px_var(--anilife-accent-shadow)] animate-pulse"
          />
        </div>

        {}
        <div className="text-[11px] font-medium text-zinc-500 tracking-wider">
          Welcome to Anilife
        </div>
      </div>
    </div>
  );
};

