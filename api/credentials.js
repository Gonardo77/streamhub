import { requireAuth, saveCreds, getCreds, getAllCreds } from '../../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // ── Save credentials for a platform ──
  if (req.method === 'POST') {
    const { platform, email, password } = req.body || {};
    const validPlatforms = ['netflix', 'disney', 'amazon', 'flow'];

    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    await saveCreds(user.userId, platform, email, password);
    return res.status(200).json({ ok: true, platform });
  }

  // ── Get which platforms are configured (no passwords returned) ──
  if (req.method === 'GET') {
    const all = await getAllCreds(user.userId);
    const configured = Object.keys(all).reduce((acc, p) => {
      acc[p] = { email: all[p].email, connected: true };
      return acc;
    }, {});
    return res.status(200).json({ platforms: configured });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
