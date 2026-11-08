import React, { useState, useEffect } from 'react';

interface AppIntroProps {
  onFinish: () => void;
}

export const AppIntro: React.FC<AppIntroProps> = ({ onFinish }) => {
  const [progress, setProgress] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [imgSrc, setImgSrc] = useState('/assets/images/Anilife-Animated-Logo-V4.gif');

  useEffect(() => {
    const startTime = Date.now();
    const duration = 2200; 

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setProgress(pct);

      if (pct >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          setIsFadingOut(true);
          setTimeout(() => {
            try {
              sessionStorage.setItem('anilife_intro_seen', '1');
            } catch {}
            onFinish();
          }, 350);
        }, 150);
      }
    }, 25);

    return () => clearInterval(interval);
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
            className="w-full h-full object-contain filter drop-shadow-[0_0_20px_rgba(116,207,102,0.4)] animate-pulse"
          />
        </div>

        {}
        <div className="w-56 sm:w-64 flex flex-col items-center space-y-2">
          <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
            <div
              className="h-full bg-[#74cf66] rounded-full transition-all duration-75 shadow-[0_0_12px_#74cf66]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-[11px] font-medium text-zinc-500 tracking-wider">
            Loading Anilife...
          </div>
        </div>
      </div>
    </div>
  );
};

