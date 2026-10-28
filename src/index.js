import express from 'express';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { pool, redisClient, initDatabase } from './config/db.js';
import { encodeBase62 } from './utils/base62.js';
import { rateLimiter } from './middleware/rateLimiter.js';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const CACHE_TTL = 86400; // 24 hours in seconds

// Helper: Hash IP for privacy-safe analytics
function hashIp(ip) {
  return crypto.createHash('sha256').update(ip || 'unknown').digest('hex');
}

// 0. GET / - Interactive Web Dashboard & Live API Tester
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Base62 High-Performance URL Shortener</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex flex-col items-center justify-center p-6 font-sans">
  <main class="max-w-2xl w-full space-y-8">
    <div class="text-center space-y-3">
      <span class="inline-block rounded-full bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-400">
        Node.js + PostgreSQL + Redis Cache-Aside + Rate Limiter
      </span>
      <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
        High-Performance URL Shortener
      </h1>
      <p class="text-slate-400 text-sm">
        Deterministic Base62 encoding with cached redirects and non-blocking click telemetry.
      </p>
    </div>

    <div class="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl space-y-4">
      <label class="block text-sm font-medium text-slate-300">Paste a long URL to shorten</label>
      <form id="shortenForm" class="flex flex-col sm:flex-row gap-3">
        <input
          id="urlInput"
          type="url"
          required
          placeholder="https://github.com/sklevel8/high-performance-url-shortener"
          class="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="submit"
          class="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-500 transition"
        >
          Shorten URL
        </button>
      </form>

      <div id="resultBox" class="hidden rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
        <div class="text-xs font-semibold uppercase tracking-wider text-emerald-400">Short URL Ready</div>
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <a id="shortUrlLink" href="#" target="_blank" class="text-lg font-mono font-bold text-white underline hover:text-indigo-300 break-all"></a>
          <div class="flex gap-2">
            <button id="copyBtn" class="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700">Copy</button>
            <button id="checkStatsBtn" class="rounded-lg bg-indigo-600/30 border border-indigo-500/40 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-600/50">View Live Stats</button>
          </div>
        </div>
      </div>

      <div id="errorBox" class="hidden rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300"></div>
    </div>

    <div class="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-base font-bold text-white">Real-Time Click Telemetry</h2>
        <span class="text-xs text-slate-400">GET /api/stats/:code</span>
      </div>
      <form id="statsForm" class="flex gap-3">
        <input
          id="codeInput"
          type="text"
          required
          placeholder="Enter short code (e.g. 6LAze)"
          class="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none font-mono"
        />
        <button
          type="submit"
          class="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-700 transition"
        >
          Inspect
        </button>
      </form>

      <div id="statsResult" class="hidden grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
        <div class="rounded-xl bg-slate-950 border border-slate-800 p-3">
          <div class="text-xs text-slate-400">Total Clicks</div>
          <div id="statClicks" class="text-2xl font-extrabold text-indigo-400 mt-1">0</div>
        </div>
        <div class="rounded-xl bg-slate-950 border border-slate-800 p-3">
          <div class="text-xs text-slate-400">Unique Visitors (SHA-256)</div>
          <div id="statUnique" class="text-2xl font-extrabold text-emerald-400 mt-1">0</div>
        </div>
        <div class="col-span-2 sm:col-span-1 rounded-xl bg-slate-950 border border-slate-800 p-3">
          <div class="text-xs text-slate-400">Short Code</div>
          <div id="statCode" class="text-lg font-mono font-bold text-white mt-1">-</div>
        </div>
      </div>
    </div>

    <footer class="text-center text-xs text-slate-500">
      <span>Engineered by Sipho Makubalo</span>
    </footer>
  </main>

  <script>
    const shortenForm = document.getElementById('shortenForm');
    const urlInput = document.getElementById('urlInput');
    const resultBox = document.getElementById('resultBox');
    const errorBox = document.getElementById('errorBox');
    const shortUrlLink = document.getElementById('shortUrlLink');
    const copyBtn = document.getElementById('copyBtn');
    const checkStatsBtn = document.getElementById('checkStatsBtn');
    const statsForm = document.getElementById('statsForm');
    const codeInput = document.getElementById('codeInput');
    const statsResult = document.getElementById('statsResult');

    let currentCode = '';

    shortenForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      resultBox.classList.add('hidden');
      errorBox.classList.add('hidden');

      try {
        const res = await fetch('/api/shorten', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: urlInput.value })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || 'Failed to shorten URL');

        currentCode = data.shortCode;
        const fullShortUrl = window.location.origin + '/' + data.shortCode;
        shortUrlLink.href = fullShortUrl;
        shortUrlLink.textContent = fullShortUrl;
        codeInput.value = data.shortCode;
        resultBox.classList.remove('hidden');
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.classList.remove('hidden');
      }
    });

    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(shortUrlLink.href);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => (copyBtn.textContent = 'Copy'), 1500);
    });

    async function loadStats(code) {
      const res = await fetch('/api/stats/' + encodeURIComponent(code));
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Could not load stats');
        return;
      }
      document.getElementById('statClicks').textContent = data.analytics.total_clicks;
      document.getElementById('statUnique').textContent = data.analytics.unique_visitors;
      document.getElementById('statCode').textContent = data.shortCode;
      statsResult.classList.remove('hidden');
    }

    checkStatsBtn.addEventListener('click', () => {
      if (currentCode) loadStats(currentCode);
    });

    statsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      loadStats(codeInput.value.trim());
    });
  </script>
</body>
</html>`);
});

// 1. POST /api/shorten - Create a short URL (Rate limited to 10 req/min)
app.post('/api/shorten', rateLimiter({ windowSeconds: 60, maxRequests: 10 }), async (req, res) => {
  const { url } = req.body;

  // Validate URL format
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL. Include http:// or https://' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert URL and get the auto-generated ID
    const insertRes = await client.query(
      'INSERT INTO urls (original_url) VALUES ($1) RETURNING id',
      [url]
    );
    const id = insertRes.rows[0].id;
    const shortCode = encodeBase62(id);

    // Update the row with its deterministic Base62 short_code
    await client.query(
      'UPDATE urls SET short_code = $1 WHERE id = $2',
      [shortCode, id]
    );

    await client.query('COMMIT');

    // Pre-warm the Redis cache (best-effort; don't fail the request on Redis blip)
    try {
      await redisClient.setEx(
        `url:${shortCode}`,
        CACHE_TTL,
        JSON.stringify({ id, originalUrl: url })
      );
    } catch (cacheErr) {
      console.error('Redis cache warm error:', cacheErr);
    }

    return res.status(201).json({
      shortCode,
      shortUrl: `${BASE_URL}/${shortCode}`,
      originalUrl: url,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    client.release();
  }
});

// 2. GET /:code - Redirect to original URL + log analytics asynchronously
app.get('/:code', async (req, res) => {
  const { code } = req.params;

  try {
    let urlData = null;

    // Step A: Check Redis Cache First (best-effort)
    let cached = null;
    try {
      cached = await redisClient.get(`url:${code}`);
    } catch (cacheErr) {
      console.error('Redis cache read error:', cacheErr);
    }
    if (cached) {
      urlData = JSON.parse(cached);
    } else {
      // Step B: Cache Miss -> Query PostgreSQL
      const dbRes = await pool.query(
        'SELECT id, original_url FROM urls WHERE short_code = $1',
        [code]
      );

      if (dbRes.rowCount === 0) {
        return res.status(404).json({ error: 'Short URL not found' });
      }

      urlData = {
        id: dbRes.rows[0].id,
        originalUrl: dbRes.rows[0].original_url,
      };

      // Backfill Redis Cache (best-effort)
      try {
        await redisClient.setEx(`url:${code}`, CACHE_TTL, JSON.stringify(urlData));
      } catch (cacheErr) {
        console.error('Redis cache backfill error:', cacheErr);
      }
    }

    // Step C: Send 302 Redirect IMMEDIATELY (low latency)
    res.redirect(302, urlData.originalUrl);

    // Step D: Fire-and-forget Async Analytics Logging (Does NOT block the user)
    const ipHash = hashIp(req.headers['x-forwarded-for'] || req.socket.remoteAddress);
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const referrer = req.headers['referer'] || 'Direct';

    pool.query(
      'INSERT INTO clicks (url_id, ip_hash, user_agent, referrer) VALUES ($1, $2, $3, $4)',
      [urlData.id, ipHash, userAgent, referrer]
    ).catch((err) => console.error('Async Analytics Error:', err));

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 3. GET /api/stats/:code - View analytics for a short URL
app.get('/api/stats/:code', async (req, res) => {
  const { code } = req.params;

  try {
    const urlRes = await pool.query(
      'SELECT id, original_url, created_at FROM urls WHERE short_code = $1',
      [code]
    );

    if (urlRes.rowCount === 0) {
      return res.status(404).json({ error: 'Short URL not found' });
    }

    const urlRecord = urlRes.rows[0];

    const statsRes = await pool.query(
      `SELECT 
         COUNT(*)::INT AS total_clicks,
         COUNT(DISTINCT ip_hash)::INT AS unique_visitors
       FROM clicks WHERE url_id = $1`,
      [urlRecord.id]
    );

    return res.json({
      shortCode: code,
      originalUrl: urlRecord.original_url,
      createdAt: urlRecord.created_at,
      analytics: statsRes.rows[0],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Start Server
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running at ${BASE_URL}`);
  });
});