const { requireAuth, redis } = require('../lib/db');
const { loginAndCaptureCookies } = require('../lib/scraper');

function sessionKey(userId, platform) {
  return `session:${userId}:${platform}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // ── POST: Login to platform and save session cookies ──
  if (req.method === 'POST') {
    const { platform, email, password } = req.body || {};
    if (!['netflix','disney','amazon','flow'].includes(platform))
      return res.status(400).json({ error: 'Invalid platform' });
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password required' });

    // Login and capture cookies — this is the one-time login
    const result = await loginAndCaptureCookies(platform, { email, password });
    if (!result.success) {
      return res.status(401).json({ error: result.error || 'Login failed' });
    }

    // Save session cookies (not the password)
    await redis.set(sessionKey(user.userId, platform), {
      cookies: result.cookies,
      email, // save email for display only
      savedAt: Date.now(),
      expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000)
    });

    return res.status(200).json({ ok: true, platform });
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

  return res.status(405).json({ error: 'Method not allowed' });
};
