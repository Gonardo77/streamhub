const { requireAuth, getAllCreds } = require('../lib/db');
const { searchPlatforms } = require('../lib/scraper');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { query, platforms: requestedPlatforms } = req.body || {};
  if (!query) return res.status(400).json({ error: 'Query required' });

  const allCreds = await getAllCreds(user.userId);
  const activeCreds = {};
  const toSearch = requestedPlatforms || Object.keys(allCreds);
  for (const p of toSearch) {
    if (allCreds[p]) activeCreds[p] = allCreds[p];
  }

  if (Object.keys(activeCreds).length === 0) {
    return res.status(400).json({ error: 'No platforms configured. Please add your credentials first.' });
  }

  try {
    const { results: rawResults, errors } = await searchPlatforms(activeCreds, query);

    let enriched = rawResults;
    if (rawResults.length > 0) {
      const titles = rawResults.map(r => r.title).join('\n');
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: `You are a movie/TV metadata assistant. Given a list of titles, return a JSON array enriching each one.
Return ONLY valid JSON array, no markdown. Format:
[{"title":"exact title as given","year":2023,"duration":"2h 15min","age_rating":"PG-13","genre":["Action"],"synopsis":"1-2 sentences in English.","type":"movie|series"}]
Always respond in English.`,
        messages: [{ role: 'user', content: `Enrich these titles:\n${titles}` }]
      });

      try {
        const metaText = msg.content[0].text.replace(/```json|```/g, '').trim();
        const meta = JSON.parse(metaText);
        enriched = rawResults.map(r => {
          const m = meta.find(x => x.title?.toLowerCase() === r.title?.toLowerCase()) || {};
          return { ...r, ...m, title: r.title, platforms: r.platforms, url: r.url, confidence: r.confidence };
        });
      } catch { enriched = rawResults; }
    }

    return res.status(200).json({ results: enriched, errors, source: 'live' });
  } catch (e) {
    console.error('Search error:', e);
    return res.status(500).json({ error: e.message });
  }
};
