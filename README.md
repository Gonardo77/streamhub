# StreamHub

A smart streaming search app that searches across your real Netflix, Disney+, Amazon Prime Video, and Flow Argentina catalogs using your actual credentials.

## Setup

### 1. Prerequisites
- [Node.js](https://nodejs.org) 18+
- [Vercel CLI](https://vercel.com/cli): `npm i -g vercel`
- A [GitHub](https://github.com) account
- A [Vercel](https://vercel.com) account (sign up with GitHub)
- An [Upstash](https://upstash.com) account (sign up with GitHub)

### 2. Upstash Redis Database
1. Go to [upstash.com](https://upstash.com) → Create database
2. Name it `streamhub`, select region `US-East-1`
3. Copy **UPSTASH_REDIS_REST_URL** and **UPSTASH_REDIS_REST_TOKEN**

### 3. Environment Variables
Create a `.env` file in the project root:
```
UPSTASH_REDIS_REST_URL=https://your-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-here
ANTHROPIC_API_KEY=sk-ant-your-key-here
JWT_SECRET=pick-any-long-random-string
```

### 4. Deploy to Vercel
```bash
# Install dependencies
npm install

# Login to Vercel
vercel login

# Deploy (first time — follow the prompts)
vercel

# Add environment variables to Vercel
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN
vercel env add ANTHROPIC_API_KEY
vercel env add JWT_SECRET

# Deploy to production
vercel --prod
```

Vercel will give you a URL like `https://streamhub-xyz.vercel.app` — share that with your friends.

### 5. First Use
1. Open the URL
2. Create an account (email + password)
3. Click **⚙ Platforms** and connect each streaming service with your credentials
4. Start searching!

## Architecture

```
Browser → Vercel Serverless Functions → Playwright (headless Chrome)
                                      → Netflix / Disney+ / Amazon / Flow
                                      → Anthropic API (metadata enrichment)
                                      → Upstash Redis (credentials + sessions)
```

## Notes
- Credentials are base64-encoded and stored in Redis. For production, use a KMS (AWS KMS or similar).
- The Samsung TV connection uses WebSocket on port 8002 — TV must be on the same WiFi as the browser.
- Playwright on Vercel requires the `chromium` browser to be installed at build time (handled in `vercel.json`).
