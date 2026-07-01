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
    const titleList = titles.map(t => t.title).join('\n');
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: `You are a movie/TV metadata assistant. Given a list of titles, return a JSON array enriching each one.
Return ONLY valid JSON array, no markdown. Format:
[{"title":"exact title as given","year":2023,"duration":"2h 15min","age_rating":"PG-13","genre":["Action"],"synopsis":"1-2 sentences in English.","type":"movie|series"}]
Always respond in English.`,
      messages: [{ role: 'user', content: `Enrich these titles:\n${titleList}` }]
    });

    const text = msg.content[0].text.replace(/```json|```/g, '').trim();
    const results = JSON.parse(text);
    return res.status(200).json({ results });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
