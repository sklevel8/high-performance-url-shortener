# URL Shortener (Plain Modern JavaScript)

A working URL shortener built with Node.js (ES Modules), Express, PostgreSQL, and Redis.

## Quickstart

1. Start infrastructure:
   ```bash
   docker compose up -d
   ```

2. Install & run:
   ```bash
   npm install
   npm run dev
   ```

3. Shorten a URL:
   ```bash
   curl -X POST http://localhost:3000/api/shorten \
     -H "Content-Type: application/json" \
     -d '{"url": "https://github.com"}'
   ```

4. Redirect: visit `http://localhost:3000/<shortCode>`

5. Stats: `curl http://localhost:3000/api/stats/<shortCode>`

## Tests

```bash
npm test
```