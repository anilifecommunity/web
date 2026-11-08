export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const body = req.body || {};
  const title = body.title || 'Anime';
  const episode = body.episode || 1;

  const activity = {
    state: `Episode ${episode}`,
    details: title,
    timestamps: { start: Math.floor(Date.now() / 1000) },
    assets: {
      large_image: 'anilife_logo',
      large_text: 'AniLife Desktop',
      small_image: 'play',
      small_text: 'Watching on AniLife'
    }
  };

  return res.status(200).json({ success: true, activity });
}
