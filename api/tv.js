import { requireAuth } from '../../lib/db.js';

// Deep link schemes per platform
const DEEP_LINKS = {
  netflix:  (id) => `netflix://title/${id}`,
  disney:   (id) => `disneyplus://deeplink/content/${id}`,
  amazon:   (id) => `aiv://aiv/play?asin=${id}`,
  flow:     (id) => `flow://vod/${id}`
};

const PLATFORM_APP_IDS = {
  netflix: '11101200001',   // Samsung Tizen app ID for Netflix
  disney:  '3201901017598', // Disney+
  amazon:  '3201910019365', // Prime Video
  flow:    '3201907018807'  // Flow (approximate - may need updating)
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { action, tvIp, platform, contentUrl, contentId } = req.body || {};

  // ── Discover Samsung TVs on local network ──
  // Note: This endpoint gets called from the browser which knows the local network.
  // The actual WebSocket connection to the TV happens client-side.
  // This endpoint provides the correct app IDs and deep link format.
  if (action === 'get-launch-config') {
    if (!platform) return res.status(400).json({ error: 'Platform required' });

    const appId = PLATFORM_APP_IDS[platform];
    const deepLink = contentId ? DEEP_LINKS[platform]?.(contentId) : null;

    return res.status(200).json({
      appId,
      deepLink,
      // Samsung WebSocket command template the client should send
      wsCommand: {
        method: 'ms.channel.emit',
        params: {
          event: 'ed.apps.launch',
          to: 'host',
          data: {
            appId,
            action_type: deepLink ? 'DEEP_LINK' : 'NATIVE_LAUNCH',
            metaTag: deepLink || ''
          }
        }
      }
    });
  }

  return res.status(400).json({ error: 'Invalid action' });
}
