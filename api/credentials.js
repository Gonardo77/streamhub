const { requireAuth, saveCreds, getAllCreds } = require('../lib/db');
const { validateCredentials } = require('../lib/scraper');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'POST') {
    const { platform, email, password } = req.body || {};
    if (!['netflix','disney','amazon','flow'].includes(platform))
      return res.status(400).json({ error: 'Invalid platform' });
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password required' });

    // Validate credentials before saving
    try {
      const validation = await validateCredentials(platform, { email, password });
      if (!validation.success) {
        return res.status(401).json({ error: `Could not log in to ${platform}: ${validation.error}` });
      }
    } catch (e) {
      return res.status(500).json({ error: `Validation failed: ${e.message}` });
    }

    await saveCreds(user.userId, platform, email, password);
    return res.status(200).json({ ok: true, platform });
  }

  if (req.method === 'GET') {
    const all = await getAllCreds(user.userId);
    const configured = Object.keys(all).reduce((acc, p) => {
      acc[p] = { email: all[p].email, connected: true };
      return acc;
    }, {});
    return res.status(200).json({ platforms: configured });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
