const { requireAuth, redis } = require('../lib/db');
const { loginAndCaptureCookies } = require('../lib/scraper');

function sessionKey(userId, platform) {
  return `session:${userId}:${platform}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // ── POST: Save session cookies (sent by Chrome extension) ──
  if (req.method === 'POST') {
    const { platform, cookies, email } = req.body || {};
    if (!['netflix','disney','amazon','flow'].includes(platform))
      return res.status(400).json({ error: 'Invalid platform' });
    if (!cookies || !Array.isArray(cookies) || cookies.length === 0)
      return res.status(400).json({ error: 'No cookies provided. Please log in to the platform first.' });

    await redis.set(sessionKey(user.userId, platform), {
      cookies,
      email: email || '',
      savedAt: Date.now(),
      expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days
    });

    return res.status(200).json({ ok: true, platform, cookieCount: cookies.length });
  }

  // ── GET: Return which platforms are connected ──
  if (req.method === 'GET') {
    const platforms = ['netflix', 'disney', 'amazon', 'flow'];
    const configured = {};
    for (const p of platforms) {
      const s = await redis.get(sessionKey(user.userId, p));
      if (s) {
        const expired = s.expiresAt && Date.now() > s.expiresAt;
        configured[p] = { email: s.email, connected: !expired, expired };
      }
    }
    return res.status(200).json({ platforms: configured });
  }

  // ── DELETE: Disconnect a platform ──
  if (req.method === 'DELETE') {
    const { platform } = req.body || {};
    if (!platform) return res.status(400).json({ error: 'Platform required' });
    await redis.del(sessionKey(user.userId, platform));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
