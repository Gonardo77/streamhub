const puppeteer = require('puppeteer');

async function launchBrowser() {
  return puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
}

// ── Login to a platform in a real browser, return cookies ──
async function loginAndCaptureCookies(platform, creds) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    switch (platform) {
      case 'netflix':
        await page.goto('https://www.netflix.com/ar/login', { waitUntil: 'networkidle2', timeout: 30000 });
        await page.type('input[name="userLoginId"]', creds.email, { delay: 80 });
        await page.type('input[name="password"]', creds.password, { delay: 80 });
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
        if (page.url().includes('login')) throw new Error('Invalid credentials');
        break;

      case 'disney':
        await page.goto('https://www.disneyplus.com/ar/login', { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector('input[type="email"]', { timeout: 15000 });
        await page.type('input[type="email"]', creds.email, { delay: 80 });
        await page.click('button[type="submit"]');
        await page.waitForSelector('input[type="password"]', { timeout: 15000 });
        await page.type('input[type="password"]', creds.password, { delay: 80 });
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
        if (page.url().includes('login')) throw new Error('Invalid credentials');
        break;

      case 'amazon':
        await page.goto('https://www.primevideo.com/', { waitUntil: 'networkidle2', timeout: 30000 });
        const signInBtn = await page.$('a[data-nav-role="signin"]');
        if (signInBtn) {
          await signInBtn.click();
          await page.waitForNavigation({ waitUntil: 'networkidle2' });
          await page.type('#ap_email', creds.email, { delay: 80 });
          await page.click('#continue');
          await page.waitForSelector('#ap_password', { timeout: 15000 });
          await page.type('#ap_password', creds.password, { delay: 80 });
          await page.click('#signInSubmit');
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
        }
        break;

      case 'flow':
        await page.goto('https://www.flow.com.ar/', { waitUntil: 'networkidle2', timeout: 30000 });
        try {
          await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 8000 });
          await page.type('input[type="email"]', creds.email, { delay: 80 });
          const passField = await page.$('input[type="password"]');
          if (passField) {
            await passField.type(creds.password, { delay: 80 });
            await page.click('button[type="submit"]');
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
          }
        } catch { /* already logged in */ }
        break;
    }

    const cookies = await page.cookies();
    return { success: true, cookies };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    await browser.close();
  }
}

// ── Search using saved session cookies ──
async function searchWithSession(platform, cookies, query) {
  const browser = await launchBrowser();
  const results = [];
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Restore session by injecting saved cookies
    const domain = {
      netflix: 'netflix.com',
      disney: 'disneyplus.com',
      amazon: 'primevideo.com',
      flow: 'flow.com.ar'
    }[platform];

    const validCookies = cookies.filter(c => c.domain && c.domain.includes(domain.split('.')[0]));
    if (validCookies.length > 0) {
      await page.setCookie(...validCookies);
    }

    switch (platform) {
      case 'netflix': {
        await page.goto(`https://www.netflix.com/ar/search?q=${encodeURIComponent(query)}`, { waitUntil: 'networkidle2', timeout: 20000 });
        if (page.url().includes('login')) return { results: [], expired: true };
        await new Promise(r => setTimeout(r, 2000));
        const items = await page.evaluate(() => {
          const cards = document.querySelectorAll('.title-card-container');
          return Array.from(cards).slice(0, 8).map(card => ({
            title: card.querySelector('img')?.alt || '',
            link: card.querySelector('a')?.href || ''
          })).filter(i => i.title);
        });
        items.forEach(item => results.push({ title: item.title, platforms: ['netflix'], url: item.link, confidence: 'high', extra_cost: false }));
        break;
      }

      case 'disney': {
        await page.goto('https://www.disneyplus.com/ar/search', { waitUntil: 'networkidle2', timeout: 20000 });
        if (page.url().includes('login')) return { results: [], expired: true };
        try {
          await page.waitForSelector('input[data-testid="search-field"]', { timeout: 10000 });
          await page.type('input[data-testid="search-field"]', query, { delay: 80 });
          await new Promise(r => setTimeout(r, 2500));
          const items = await page.evaluate(() => {
            const cards = document.querySelectorAll('[data-testid="set-item"]');
            return Array.from(cards).slice(0, 8).map(card => ({
              title: card.querySelector('img')?.alt || '',
              link: card.querySelector('a')?.href || ''
            })).filter(i => i.title);
          });
          items.forEach(item => results.push({ title: item.title, platforms: ['disney'], url: item.link, confidence: 'high', extra_cost: false }));
        } catch {}
        break;
      }

      case 'amazon': {
        await page.goto(`https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${encodeURIComponent(query)}`, { waitUntil: 'networkidle2', timeout: 20000 });
        await new Promise(r => setTimeout(r, 2000));
        const items = await page.evaluate(() => {
          const cards = document.querySelectorAll('article');
          return Array.from(cards).slice(0, 8).map(card => ({
            title: card.querySelector('h2')?.textContent?.trim() || '',
            link: card.querySelector('a')?.href || ''
          })).filter(i => i.title);
        });
        items.forEach(item => results.push({ title: item.title, platforms: ['amazon'], url: item.link, confidence: 'high', extra_cost: false }));
        break;
      }

      case 'flow': {
        await page.goto(`https://www.flow.com.ar/buscar?q=${encodeURIComponent(query)}`, { waitUntil: 'networkidle2', timeout: 20000 });
        await new Promise(r => setTimeout(r, 2000));
        const items = await page.evaluate(() => {
          const cards = document.querySelectorAll('.content-card, article');
          return Array.from(cards).slice(0, 8).map(card => ({
            title: card.querySelector('h2, h3, .title')?.textContent?.trim() || '',
            link: card.querySelector('a')?.href || ''
          })).filter(i => i.title);
        });
        items.forEach(item => results.push({ title: item.title, platforms: ['flow'], url: item.link, confidence: 'high', extra_cost: false }));
        break;
      }
    }
  } finally {
    await browser.close();
  }
  return { results, expired: false };
}

// ── Main search across all platforms ──
async function searchPlatforms(sessionsByPlatform, query) {
  const results = [];
  const errors = [];
  const expired = [];

  for (const platform of Object.keys(sessionsByPlatform)) {
    try {
      const session = sessionsByPlatform[platform];
      const { results: items, expired: isExpired } = await searchWithSession(platform, session.cookies, query);
      if (isExpired) {
        expired.push(platform);
      } else {
        results.push(...items);
      }
    } catch (e) {
      errors.push({ platform, error: e.message });
    }
  }
  return { results, errors, expired };
}

module.exports = { searchPlatforms, loginAndCaptureCookies };
