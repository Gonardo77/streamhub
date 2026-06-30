const { requireAuth, redis } = require('../lib/db');

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

  const url = new URL(req.url, 'http://localhost');
  const action = url.pathname.split('/').pop();

  if (req.method === 'GET' && action === 'status') {
    const platforms = ['netflix', 'disney', 'amazon', 'flow'];
    const results = {};
    for (const p of platforms) {
      const s = await redis.get(sessionKey(user.userId, p));
      if (s) {
        const expired = s.expiresAt && Date.now() > s.expiresAt;
        results[p] = { connected: !expired, expired, savedAt: s.savedAt };
      }
    }
    return res.status(200).json({ sessions: results });
  }

  if (req.method === 'POST' && action === 'clear') {
    const { platform } = req.body || {};
    if (!platform) return res.status(400).json({ error: 'Platform required' });
    await redis.del(sessionKey(user.userId, platform));
    return res.status(200).json({ ok: true });
  }

  return res.status(404).json({ error: 'Not found' });
};
