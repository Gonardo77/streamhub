const { chromium } = require('playwright');

async function searchPlatforms(credsByPlatform, query) {
  const results = [];
  const errors = [];
  await Promise.allSettled(
    Object.keys(credsByPlatform).map(async (platform) => {
      try {
        const items = await searchPlatform(platform, credsByPlatform[platform], query);
        results.push(...items);
      } catch (e) {
        errors.push({ platform, error: e.message });
      }
    })
  );
  return { results, errors };
}

async function searchPlatform(platform, creds, query) {
  switch (platform) {
    case 'netflix': return searchNetflix(creds, query);
    case 'disney':  return searchDisney(creds, query);
    case 'amazon':  return searchAmazon(creds, query);
    case 'flow':    return searchFlow(creds, query);
    default: return [];
  }
}

async function launchBrowser() {
  return chromium.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] });
}

async function searchNetflix(creds, query) {
  const browser = await launchBrowser();
  const results = [];
  try {
    const ctx = await browser.newContext({ locale:'es-AR', timezoneId:'America/Argentina/Buenos_Aires' });
    const page = await ctx.newPage();
    await page.goto('https://www.netflix.com/ar/login', { waitUntil:'networkidle' });
    await page.fill('input[name="userLoginId"]', creds.email);
    await page.fill('input[name="password"]', creds.password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil:'networkidle', timeout:15000 });
    await page.goto(`https://www.netflix.com/ar/search?q=${encodeURIComponent(query)}`, { waitUntil:'networkidle' });
    await page.waitForTimeout(2000);
    const items = await page.evaluate(() => {
      const cards = document.querySelectorAll('.title-card-container');
      return Array.from(cards).slice(0,8).map(card => {
        const img = card.querySelector('img');
        const link = card.querySelector('a')?.href || '';
        return { title: img?.alt || '', link };
      }).filter(i => i.title);
    });
    items.forEach(item => results.push({ title: item.title, platforms: ['netflix'], url: item.link, confidence: 'high', extra_cost: false }));
  } finally { await browser.close(); }
  return results;
}

async function searchDisney(creds, query) {
  const browser = await launchBrowser();
  const results = [];
  try {
    const ctx = await browser.newContext({ locale:'es-AR', timezoneId:'America/Argentina/Buenos_Aires' });
    const page = await ctx.newPage();
    await page.goto('https://www.disneyplus.com/ar/login', { waitUntil:'networkidle' });
    await page.waitForSelector('input[type="email"]', { timeout:10000 });
    await page.fill('input[type="email"]', creds.email);
    await page.click('button[type="submit"]');
    await page.waitForSelector('input[type="password"]', { timeout:10000 });
    await page.fill('input[type="password"]', creds.password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil:'networkidle', timeout:15000 });
    await page.goto('https://www.disneyplus.com/ar/search', { waitUntil:'networkidle' });
    await page.waitForSelector('input[data-testid="search-field"]', { timeout:10000 });
    await page.fill('input[data-testid="search-field"]', query);
    await page.waitForTimeout(2500);
    const items = await page.evaluate(() => {
      const cards = document.querySelectorAll('[data-testid="set-item"]');
      return Array.from(cards).slice(0,8).map(card => {
        const img = card.querySelector('img');
        return { title: img?.alt || '', link: card.querySelector('a')?.href || '' };
      }).filter(i => i.title);
    });
    items.forEach(item => results.push({ title: item.title, platforms: ['disney'], url: item.link, confidence: 'high', extra_cost: false }));
  } finally { await browser.close(); }
  return results;
}

async function searchAmazon(creds, query) {
  const browser = await launchBrowser();
  const results = [];
  try {
    const ctx = await browser.newContext({ locale:'es-AR', timezoneId:'America/Argentina/Buenos_Aires' });
    const page = await ctx.newPage();
    await page.goto('https://www.primevideo.com/', { waitUntil:'networkidle' });
    const signInBtn = await page.$('a[data-nav-role="signin"]');
    if (signInBtn) {
      await signInBtn.click();
      await page.waitForNavigation({ waitUntil:'networkidle' });
      await page.fill('#ap_email', creds.email);
      await page.click('#continue');
      await page.waitForSelector('#ap_password', { timeout:10000 });
      await page.fill('#ap_password', creds.password);
      await page.click('#signInSubmit');
      await page.waitForNavigation({ waitUntil:'networkidle', timeout:15000 });
    }
    await page.goto(`https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${encodeURIComponent(query)}`, { waitUntil:'networkidle' });
    await page.waitForTimeout(2000);
    const items = await page.evaluate(() => {
      const cards = document.querySelectorAll('article');
      return Array.from(cards).slice(0,8).map(card => ({
        title: card.querySelector('h2')?.textContent?.trim() || '',
        link: card.querySelector('a')?.href || ''
      })).filter(i => i.title);
    });
    items.forEach(item => results.push({ title: item.title, platforms: ['amazon'], url: item.link, confidence: 'high', extra_cost: false }));
  } finally { await browser.close(); }
  return results;
}

async function searchFlow(creds, query) {
  const browser = await launchBrowser();
  const results = [];
  try {
    const ctx = await browser.newContext({ locale:'es-AR', timezoneId:'America/Argentina/Buenos_Aires' });
    const page = await ctx.newPage();
    await page.goto('https://www.flow.com.ar/', { waitUntil:'networkidle' });
    try {
      await page.waitForSelector('input[type="email"], input[name="email"]', { timeout:8000 });
      await page.fill('input[type="email"], input[name="email"]', creds.email);
      const passField = await page.$('input[type="password"]');
      if (passField) {
        await passField.fill(creds.password);
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil:'networkidle', timeout:15000 }).catch(() => {});
      }
    } catch { /* already logged in */ }
    await page.goto(`https://www.flow.com.ar/buscar?q=${encodeURIComponent(query)}`, { waitUntil:'networkidle' });
    await page.waitForTimeout(2000);
    const items = await page.evaluate(() => {
      const cards = document.querySelectorAll('.content-card, article');
      return Array.from(cards).slice(0,8).map(card => ({
        title: card.querySelector('h2, h3, .title')?.textContent?.trim() || '',
        link: card.querySelector('a')?.href || ''
      })).filter(i => i.title);
    });
    items.forEach(item => results.push({ title: item.title, platforms: ['flow'], url: item.link, confidence: 'high', extra_cost: false }));
  } finally { await browser.close(); }
  return results;
}

module.exports = { searchPlatforms };
