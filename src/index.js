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
console.log('Starting initDatabase...');
initDatabase().then(() => {
  console.log('initDatabase done, calling app.listen on port', PORT);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running at ${BASE_URL}`);
  });
}).catch((err) => {
  console.error('initDatabase failed:', err);
});