import { chromium } from 'playwright';

// ── Session cache (in-memory per serverless instance) ──
const sessionCache = {};

// ── Main search function ──
export async function searchPlatforms(credsByPlatform, query) {
  const results = [];
  const errors = [];

  const platforms = Object.keys(credsByPlatform);

  // Run searches in parallel
  await Promise.allSettled(
    platforms.map(async (platform) => {
      try {
        const creds = credsByPlatform[platform];
        const items = await searchPlatform(platform, creds, query);
        results.push(...items);
      } catch (e) {
        errors.push({ platform, error: e.message });
      }
    })
  );

  return { results, errors };
}

// ── Per-platform search ──
async function searchPlatform(platform, creds, query) {
  switch (platform) {
    case 'netflix': return searchNetflix(creds, query);
    case 'disney':  return searchDisney(creds, query);
    case 'amazon':  return searchAmazon(creds, query);
    case 'flow':    return searchFlow(creds, query);
    default: return [];
  }
}

// ── Shared browser launcher ──
async function launchBrowser() {
  return chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
}

// ── Netflix ──
async function searchNetflix(creds, query) {
  const browser = await launchBrowser();
  const results = [];
  try {
    const ctx = await browser.newContext({
      locale: 'es-AR',
      timezoneId: 'America/Argentina/Buenos_Aires',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36'
    });
    const page = await ctx.newPage();

    // Login
    await page.goto('https://www.netflix.com/ar/login', { waitUntil: 'networkidle' });
    await page.fill('input[name="userLoginId"]', creds.email);
    await page.fill('input[name="password"]', creds.password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 });

    // Search
    const encoded = encodeURIComponent(query);
    await page.goto(`https://www.netflix.com/ar/search?q=${encoded}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Scrape results
    const items = await page.evaluate(() => {
      const cards = document.querySelectorAll('.title-card-container, [data-list-context="search"] .slider-item');
      return Array.from(cards).slice(0, 8).map(card => {
        const img = card.querySelector('img');
        const title = img?.alt || card.querySelector('.title-card .bob-title')?.textContent || '';
        const link = card.querySelector('a')?.href || '';
        const id = link.match(/\/title\/(\d+)/)?.[1] || '';
        return { title, id, link };
      }).filter(i => i.title);
    });

    for (const item of items) {
      if (item.title) {
        results.push({
          title: item.title,
          platforms: ['netflix'],
          url: item.link || `https://www.netflix.com/ar/title/${item.id}`,
          platform_id: item.id,
          confidence: 'high',
          extra_cost: false
        });
      }
    }
  } finally {
    await browser.close();
  }
  return results;
}

// ── Disney+ ──
async function searchDisney(creds, query) {
  const browser = await launchBrowser();
  const results = [];
  try {
    const ctx = await browser.newContext({
      locale: 'es-AR',
      timezoneId: 'America/Argentina/Buenos_Aires',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36'
    });
    const page = await ctx.newPage();

    // Login
    await page.goto('https://www.disneyplus.com/ar/login', { waitUntil: 'networkidle' });
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.fill('input[type="email"]', creds.email);
    await page.click('button[type="submit"]');
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    await page.fill('input[type="password"]', creds.password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 });

    // Search
    await page.goto('https://www.disneyplus.com/ar/search', { waitUntil: 'networkidle' });
    await page.waitForSelector('input[data-testid="search-field"]', { timeout: 10000 });
    await page.fill('input[data-testid="search-field"]', query);
    await page.waitForTimeout(2500);

    const items = await page.evaluate(() => {
      const cards = document.querySelectorAll('[data-testid="set-item"], .search-result-item');
      return Array.from(cards).slice(0, 8).map(card => {
        const img = card.querySelector('img');
        const title = img?.alt || card.querySelector('[data-testid="card-title"]')?.textContent || '';
        const link = card.querySelector('a')?.href || '';
        return { title, link };
      }).filter(i => i.title);
    });

    for (const item of items) {
      results.push({
        title: item.title,
        platforms: ['disney'],
        url: item.link,
        confidence: 'high',
        extra_cost: false
      });
    }
  } finally {
    await browser.close();
  }
  return results;
}

// ── Amazon Prime Video ──
async function searchAmazon(creds, query) {
  const browser = await launchBrowser();
  const results = [];
  try {
    const ctx = await browser.newContext({
      locale: 'es-AR',
      timezoneId: 'America/Argentina/Buenos_Aires',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36'
    });
    const page = await ctx.newPage();

    await page.goto('https://www.primevideo.com/', { waitUntil: 'networkidle' });

    // Check if login needed
    const signInBtn = await page.$('a[data-nav-role="signin"]');
    if (signInBtn) {
      await signInBtn.click();
      await page.waitForNavigation({ waitUntil: 'networkidle' });
      await page.fill('#ap_email', creds.email);
      await page.click('#continue');
      await page.waitForSelector('#ap_password', { timeout: 10000 });
      await page.fill('#ap_password', creds.password);
      await page.click('#signInSubmit');
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 });
    }

    // Search
    const encoded = encodeURIComponent(query);
    await page.goto(`https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${encoded}&ie=UTF8`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const items = await page.evaluate(() => {
      const cards = document.querySelectorAll('[data-testid="card-view"] article, .DVWebNode-SearchResult article');
      return Array.from(cards).slice(0, 8).map(card => {
        const title = card.querySelector('h2, [data-automation-id="title"]')?.textContent?.trim() || '';
        const link = card.querySelector('a')?.href || '';
        return { title, link };
      }).filter(i => i.title);
    });

    for (const item of items) {
      results.push({
        title: item.title,
        platforms: ['amazon'],
        url: item.link,
        confidence: 'high',
        extra_cost: false
      });
    }
  } finally {
    await browser.close();
  }
  return results;
}

// ── Flow Argentina ──
async function searchFlow(creds, query) {
  const browser = await launchBrowser();
  const results = [];
  try {
    const ctx = await browser.newContext({
      locale: 'es-AR',
      timezoneId: 'America/Argentina/Buenos_Aires',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36'
    });
    const page = await ctx.newPage();

    // Flow login
    await page.goto('https://www.flow.com.ar/', { waitUntil: 'networkidle' });

    // Try to find login button
    const loginBtn = await page.$('a[href*="login"], button:has-text("Iniciar sesión")');
    if (loginBtn) {
      await loginBtn.click();
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    }

    await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="mail"]', { timeout: 10000 });
    await page.fill('input[type="email"], input[name="email"]', creds.email);
    const passField = await page.$('input[type="password"]');
    if (passField) {
      await passField.fill(creds.password);
      await page.click('button[type="submit"]');
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    }

    // Search via Flow's search
    await page.goto(`https://www.flow.com.ar/buscar?q=${encodeURIComponent(query)}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const items = await page.evaluate(() => {
      const cards = document.querySelectorAll('.content-card, .vod-card, article');
      return Array.from(cards).slice(0, 8).map(card => {
        const title = card.querySelector('h2, h3, .title, [class*="title"]')?.textContent?.trim() || '';
        const link = card.querySelector('a')?.href || '';
        return { title, link };
      }).filter(i => i.title);
    });

    for (const item of items) {
      results.push({
        title: item.title,
        platforms: ['flow'],
        url: item.link,
        confidence: 'high',
        extra_cost: false
      });
    }
  } finally {
    await browser.close();
  }
  return results;
}
