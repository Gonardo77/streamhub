import { requireAuth, getAllCreds } from '../../lib/db.js';
import { searchPlatforms } from '../../lib/scraper.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { query, platforms: requestedPlatforms } = req.body || {};
  if (!query) return res.status(400).json({ error: 'Query required' });

  // Get all stored credentials for this user
  const allCreds = await getAllCreds(user.userId);

  // Filter to only requested platforms (if specified), and only ones with credentials
  const activeCreds = {};
  const toSearch = requestedPlatforms || Object.keys(allCreds);
  for (const p of toSearch) {
    if (allCreds[p]) activeCreds[p] = allCreds[p];
  }

  if (Object.keys(activeCreds).length === 0) {
    return res.status(400).json({ error: 'No platforms configured. Please add your credentials first.' });
  }

  try {
    // Step 1: Scrape real results from each platform
    const { results: rawResults, errors } = await searchPlatforms(activeCreds, query);

    // Step 2: Use Claude to enrich results with metadata (year, genre, synopsis, age rating)
    // since scrapers only get title + URL
    let enriched = rawResults;
    if (rawResults.length > 0) {
      const titles = rawResults.map(r => r.title).join('\n');
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: `You are a movie/TV metadata assistant. Given a list of titles, return a JSON array enriching each one.
Return ONLY valid JSON array, no markdown. Format:
[{
  "title": "exact title as given",
  "year": 2023,
  "duration": "2h 15min",
  "age_rating": "PG-13",
  "genre": ["Action","Thriller"],
  "synopsis": "1-2 sentences in English.",
  "type": "movie|series"
}]
If you don't know a title's details, make your best estimate. Always respond in English.`,
        messages: [{ role: 'user', content: `Enrich these titles:\n${titles}` }]
      });

      try {
        const metaText = msg.content[0].text.replace(/```json|```/g, '').trim();
        const meta = JSON.parse(metaText);
        // Merge metadata back into results
        enriched = rawResults.map(r => {
          const m = meta.find(x => x.title?.toLowerCase() === r.title?.toLowerCase()) || {};
          return { ...r, ...m, title: r.title, platforms: r.platforms, url: r.url, confidence: r.confidence };
        });
      } catch {
        // If enrichment parsing fails, return raw results
        enriched = rawResults;
      }
    }

    return res.status(200).json({
      results: enriched,
      errors,
      source: 'live' // tells the frontend these are real catalog results
    });

  } catch (e) {
    console.error('Search error:', e);
    return res.status(500).json({ error: e.message });
  }
}
