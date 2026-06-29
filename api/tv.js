const { requireAuth } = require('../lib/db');

const PLATFORM_APP_IDS = {
  netflix: '11101200001',
  disney:  '3201901017598',
  amazon:  '3201910019365',
  flow:    '3201907018807'
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { action, platform } = req.body || {};

  if (action === 'get-launch-config') {
    if (!platform) return res.status(400).json({ error: 'Platform required' });
    const appId = PLATFORM_APP_IDS[platform];
    return res.status(200).json({
      appId,
      wsCommand: {
        method: 'ms.channel.emit',
        params: {
          event: 'ed.apps.launch',
          to: 'host',
          data: { appId, action_type: 'NATIVE_LAUNCH', metaTag: '' }
        }
      }
    });
  }

  return res.status(400).json({ error: 'Invalid action' });
};
