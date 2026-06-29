const puppeteer = require('puppeteer');

async function launchBrowser() {
  return puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
}

async function searchPlatforms(credsByPlatform, query) {
  const results = [];
  const errors = [];
  for (const platform of Object.keys(credsByPlatform)) {
    try {
      const items = await searchPlatform(platform, credsByPlatform[platform], query);
      results.push(...items);
    } catch (e) {
      errors.push({ platform, error: e.message });
    }
  }
  return { results, errors };
}

async function validateCredentials(platform, creds) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    return await doLogin(platform, page, creds);
  } finally {
    await browser.close();
  }
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

async function doLogin(platform, page, creds) {
  switch (platform) {
    case 'netflix': {
      await page.goto('https://www.netflix.com/ar/login', { waitUntil: 'networkidle2', timeout: 30000 });
      await page.type('input[name="userLoginId"]', creds.email, { delay: 50 });
      await page.type('input[name="password"]', creds.password, { delay: 50 });
      await page.click('button[type="submit"]');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
      const url = page.url();
      if (url.includes('login') || url.includes('LoginError')) return { success: false, error: 'Invalid credentials' };
      return { success: true };
    }
    case 'disney': {
      await page.goto('https://www.disneyplus.com/ar/login', { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForSelector('input[type="email"]', { timeout: 10000 });
      await page.type('input[type="email"]', creds.email, { delay: 50 });
      await page.click('button[type="submit"]');
      await page.waitForSelector('input[type="password"]', { timeout: 10000 });
      await page.type('input[type="password"]', creds.password, { delay: 50 });
      await page.click('button[type="submit"]');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
      const url = page.url();
      if (url.includes('login')) return { success: false, error: 'Invalid credentials' };
      return { success: true };
    }
    case 'amazon': {
      await page.goto('https://www.primevideo.com/', { waitUntil: 'networkidle2', timeout: 30000 });
      const signInBtn = await page.$('a[data-nav-role="signin"]');
      if (!signInBtn) return { success: true }; // already logged in
      await signInBtn.click();
      await page.waitForNavigation({ waitUntil: 'networkidle2' });
      await page.type('#ap_email', creds.email, { delay: 50 });
      await page.click('#continue');
      await page.waitForSelector('#ap_password', { timeout: 10000 });
      await page.type('#ap_password', creds.password, { delay: 50 });
      await page.click('#signInSubmit');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
      const hasError = await page.$('#auth-error-message-box');
      if (hasError) return { success: false, error: 'Invalid credentials' };
      return { success: true };
    }
    case 'flow': {
      await page.goto('https://www.flow.com.ar/', { waitUntil: 'networkidle2', timeout: 30000 });
      try {
        await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 8000 });
        await page.type('input[type="email"]', creds.email, { delay: 50 });
        const passField = await page.$('input[type="password"]');
        if (passField) {
          await passField.type(creds.password, { delay: 50 });
          await page.click('button[type="submit"]');
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
        }
      } catch { /* already logged in */ }
      return { success: true };
    }
    default: return { success: false, error: 'Unknown platform' };
  }
}

async function searchNetflix(creds, query) {
  const browser = await launchBrowser();
  const results = [];
  try {
    const page = await browser.newPage();
    const loginResult = await doLogin('netflix', page, creds);
    if (!loginResult.success) return results;
    await page.goto(`https://www.netflix.com/ar/search?q=${encodeURIComponent(query)}`, { waitUntil: 'networkidle2', timeout: 20000 });
    await new Promise(r => setTimeout(r, 2000));
    const items = await page.evaluate(() => {
      const cards = document.querySelectorAll('.title-card-container');
      return Array.from(cards).slice(0, 8).map(card => ({
        title: card.querySelector('img')?.alt || '',
        link: card.querySelector('a')?.href || ''
      })).filter(i => i.title);
    });
    items.forEach(item => results.push({ title: item.title, platforms: ['netflix'], url: item.link, confidence: 'high', extra_cost: false }));
  } finally { await browser.close(); }
  return results;
}

async function searchDisney(creds, query) {
  const browser = await launchBrowser();
  const results = [];
  try {
    const page = await browser.newPage();
    const loginResult = await doLogin('disney', page, creds);
    if (!loginResult.success) return results;
    await page.goto('https://www.disneyplus.com/ar/search', { waitUntil: 'networkidle2', timeout: 20000 });
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
  } finally { await browser.close(); }
  return results;
}

async function searchAmazon(creds, query) {
  const browser = await launchBrowser();
  const results = [];
  try {
    const page = await browser.newPage();
    const loginResult = await doLogin('amazon', page, creds);
    if (!loginResult.success) return results;
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
  } finally { await browser.close(); }
  return results;
}

async function searchFlow(creds, query) {
  const browser = await launchBrowser();
  const results = [];
  try {
    const page = await browser.newPage();
    await doLogin('flow', page, creds);
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
  } finally { await browser.close(); }
  return results;
}

module.exports = { searchPlatforms, validateCredentials };
