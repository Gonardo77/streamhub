const Anthropic = require('@anthropic-ai/sdk');
const { requireAuth } = require('../lib/db');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { titles } = req.body || {};
  if (!titles?.length) return res.status(400).json({ error: 'Titles required' });

  try {
    const batch = titles.slice(0, 3);
    const titleList = batch.map(t => t.title).join('\n');
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: `Return a JSON array enriching these titles. ONLY JSON, no markdown.
Format: [{"title":"exact title","year":2023,"type":"movie or series","duration":"1h 30min","seasons":null,"episodes":null,"age_rating":"PG-13","genre":["Drama"],"synopsis":"One sentence."}]
Titles:\n${titleList}` }]
    });

    const text = msg.content[0].text.replace(/```json|```/g, '').trim();
    const results = JSON.parse(text);
    return res.status(200).json({ results });
  } catch (e) {
    console.error('Enrich error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
