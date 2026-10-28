import { redisClient } from '../config/db.js';

export function rateLimiter({ windowSeconds = 60, maxRequests = 10 }) {
  return async (req, res, next) => {
    try {
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      const key = `ratelimit:${clientIp}`;

      const currentRequests = await redisClient.incr(key);

      if (currentRequests === 1) {
        await redisClient.expire(key, windowSeconds);
      }

      const ttl = await redisClient.ttl(key);
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - currentRequests));
      res.setHeader('X-RateLimit-Reset', ttl);

      if (currentRequests > maxRequests) {
        return res.status(429).json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Try again in ${ttl} seconds.`,
        });
      }

      next();
    } catch (error) {
      console.error('Rate Limiter Error:', error);
      next(); // Fail-open so a Redis blip doesn't bring down the API
    }
  };
}