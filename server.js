const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;

// ── Route handlers ──
const auth = require('./api/auth');
const credentials = require('./api/credentials');
const search = require('./api/search');
const tv = require('./api/tv');
const session = require('./api/session');

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function makeRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  };
  res.end = res.end.bind(res);
  return res;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.statusCode = 200; res.end(); return; }

  // Parse body for POST requests
  if (req.method === 'POST') {
    req.body = await parseBody(req);
  }

  const wrappedRes = makeRes(res);

  try {
    // API routes
    if (pathname === '/api/auth')        return auth(req, wrappedRes);
    if (pathname === '/api/credentials') return credentials(req, wrappedRes);
    if (pathname === '/api/search')      return search(req, wrappedRes);
    if (pathname === '/api/tv')          return tv(req, wrappedRes);
    if (pathname.startsWith('/api/session')) return session(req, wrappedRes);

    // Serve static files
    let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath)) filePath = path.join(__dirname, 'public', 'index.html');

    const ext = path.extname(filePath);
    const contentType = ext === '.html' ? 'text/html' : ext === '.js' ? 'application/javascript' : 'text/plain';
    res.setHeader('Content-Type', contentType);
    res.statusCode = 200;
    fs.createReadStream(filePath).pipe(res);

  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, () => console.log(`StreamHub running on port ${PORT}`));
