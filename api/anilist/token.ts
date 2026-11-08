export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const body = req.body || {};
  const { code, redirect_uri } = body;
  if (!code) {
    return res.status(400).json({ error: 'Missing code parameter' });
  }

  const clientId = '55798';
  const clientSecret = 'wZ5WFRWClRvdjVRhGDxWac7NR12HrYA6bJRZ0FX3';

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('code', code);
    if (redirect_uri) {
      params.append('redirect_uri', redirect_uri);
    }

    const tokenRes = await fetch('https://anilist.co/api/v2/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString()
    });

    const data = await tokenRes.json();
    return res.status(tokenRes.status).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: 'Token exchange failed', details: err?.message || String(err) });
  }
}
