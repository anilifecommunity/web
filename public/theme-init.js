(() => {
  try {
    const saved = JSON.parse(localStorage.getItem('anilife_settings_v3') || 'null');
    const accent = saved && /^#[0-9a-f]{6}$/i.test(saved.accentColor) ? saved.accentColor : '#74cf66';
    const canvasMode = saved?.canvasBackground || (matchMedia('(prefers-color-scheme: dark)').matches ? 'amoled' : 'dark');
    const canvas = canvasMode === 'amoled' ? '#000000' : '#121214';
    document.documentElement.style.setProperty('--anilife-accent', accent);
    document.documentElement.style.setProperty('--anilife-canvas', canvas);
    document.querySelector('meta[name="theme-color"]').content = canvas;
  } catch {}
})();
