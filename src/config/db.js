import pg from 'pg';
import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

// 1. PostgreSQL Connection Pool
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => console.error('PostgreSQL Pool Error:', err.message || err));

// 2. Redis Client Setup
export const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    connectTimeout: 3000,
    reconnectStrategy: false,
  },
});

let redisAvailable = false;

redisClient.on('ready', () => {
  redisAvailable = true;
  console.log('✅ Redis ready');
});

redisClient.on('end', () => {
  redisAvailable = false;
  console.log('⚠️  Redis disconnected');
});

redisClient.on('error', (err) => {
  redisAvailable = false;
  // Only log, don't crash
  console.error('Redis Client Error:', err.message || err);
});

export function isRedisAvailable() {
  return redisAvailable;
}

// 3. Auto-Initialize Database Tables on Startup
export async function initDatabase() {
  try {
    await redisClient.connect();
    console.log('✅ Connected to Redis');
    redisAvailable = true;
  } catch (err) {
    console.error('⚠️  Redis unavailable at startup — running without cache/rate-limiting:', err.message);
  }

  const createTablesQuery = `
    CREATE TABLE IF NOT EXISTS urls (
      id BIGSERIAL PRIMARY KEY,
      short_code VARCHAR(10) UNIQUE,
      original_url TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_urls_short_code ON urls(short_code);

    CREATE TABLE IF NOT EXISTS clicks (
      id BIGSERIAL PRIMARY KEY,
      url_id BIGINT REFERENCES urls(id) ON DELETE CASCADE,
      clicked_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      ip_hash VARCHAR(64),
      user_agent TEXT,
      referrer TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_clicks_url_id ON clicks(url_id);
  `;

  await pool.query(createTablesQuery);
  console.log('✅ PostgreSQL tables & indexes verified');
}