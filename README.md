# MetroLens

A React + Vite + TypeScript dashboard for comparing U.S. metropolitan regional price parity (RPP) indexes. Express retrieves BEA data, serves the production frontend, interprets retrieved evidence with the official OpenAI SDK, and optionally stores feedback in Google Sheets. No accounts required.

## Local development

Use Node.js **24 LTS** (Node 22.12+ also meets Vite's minimum). From this repository:

```sh
npm ci
cp .env.example .env
npm run dev
```

Vite runs on port 5173 and proxies `/api` to Express on 3001. For another backend port, also adjust the Vite proxy in `vite.config.ts`. Production uses only Express:

```sh
npm test
npm run build
npm start
```

Open the host and port shown by the local server. Configure environment variables in `.env` or the process environment; never put secrets in `VITE_*` variables. `.env` is ignored. Do not commit service account JSON files.

| Variable | Purpose |
| --- | --- |
| `BEA_API_KEY` | Server-side BEA API user ID, obtained from BEA's API registration |
| `DATA_MODE` | `auto` (default): demo only if BEA key absent; `live`: require key; `demo`: explicitly use synthetic data |
| `OPENAI_API_KEY` | Optional server-side OpenAI credential; absent means useful unavailable state |
| `OPENAI_MODEL` | Configurable Responses API model, default `gpt-4.1-mini`; choose a model available to your project |
| `PORT` | Express listening port, default 3001 |
| `CACHE_TTL_HOURS` | Successful BEA cache freshness, default 24 hours |
| `TRUST_PROXY` | Set to `1` only when exactly one trusted Nginx reverse proxy is in front |
| `GOOGLE_APPLICATION_CREDENTIALS` | Absolute path to optional Google service account JSON outside the repository |
| `GOOGLE_SPREADSHEET_ID` | Optional feedback spreadsheet ID |

No API credentials are bundled. With no BEA key, a prominent demo banner identifies **synthetic** indexes across 12 metros and five example years. Demo years are fixture data; live years and metros are derived from the BEA response. Live failures never silently fall back to demo. AI recommendations require live data and an OpenAI key. Without Sheets the dashboard remains fully usable and feedback submission is disabled.

## Features and behavior

Explore ranks available metros in the selected year and category. Search filters the ranking and list; the chart displays up to 20 matches to keep labels readable. Select up to three areas; Compare shows grouped categories, historical lines and a complete comparison table. Missing observations remain gaps or `—`, never zero. The URL preserves areas, year, category and view. All comparisons use a single year; percentage differences are `(B / A - 1) × 100`, relative to the first selected area.

AI requests include the selected observations, five cheapest metros for each category in the selected year, server-computed differences and freshness warnings. History is capped at six messages, input at 1,500 characters, output at 700 tokens, and chat at 12 requests/minute/IP. The model interprets evidence and asks clarifying questions; application code handles rankings/calculations. Answers are plain React text, never raw HTML. Chat is not saved to Sheets; OpenAI requests use `store: false`. Normal API processing still sends the bounded conversation to OpenAI; review your provider's data policy before use. Rate limits are process-local; use shared infrastructure before scaling to multiple workers.

## BEA integration and cache

The backend allowlists `GetData`, `Regional`, `MARPP`, `GeoFips=MSA`, `Year=LAST5`, JSON and category line codes 1–5. It sends five separate requests with at most two concurrent, 20-second request timeouts, and two bounded retries with backoff. HTTP-200 BEA error objects are rejected. Suppression codes and malformed numbers become missing values. Geographic identifiers remain strings.

Successful complete data is atomically persisted to `.cache/bea.json` and reused across restarts. Requests share an in-flight load. After the TTL expires, categories refresh; failed categories reuse old cached records if available and expose warnings/stale status. Without cache they remain absent with a partial-data warning. Partial refreshes do not replace the last complete persistent cache. A total failure without cached data produces a 503 and retry UI. Keep `.cache` writable and persistent. Protect this directory from public static serving (Express serves only `dist`).

RPP indexes are **not dollar expenses**. The U.S. reference is 100; 110 is approximately 10% above the national reference in that year. Rent indexes are not monthly rents. Metros span broader areas than cities/neighborhoods. Historical relative price changes are not local inflation. BEA annual data is not real-time. Use BEA's published all-items measure; category indexes are not summed or averaged to reconstruct it. Cost recommendations do not assess safety, weather, schools, employment or overall suitability.

Source: https://www.bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area
API: https://apps.bea.gov/api/data/
OpenAI implementation reference: https://github.com/openai/openai-node#usage (Responses API).

## Optional Google Sheets

1. Create a Google Cloud project. Enable **Google Sheets API**.
2. Create a service account and a JSON key. Store the key outside the checkout, for example `/etc/metrolens/google-service-account.json`, readable only by the app user (`chmod 600`). Do not paste it into source, chat or client configuration.
3. Create a spreadsheet and share it as **Editor** with the service account's `client_email`.
4. Create a tab named `Feedback` with columns `timestamp`, `feedback`, `area_ids`, `data_year`, `category`, `preferences` (A:F).
5. Set `GOOGLE_APPLICATION_CREDENTIALS` to the key file path and `GOOGLE_SPREADSHEET_ID` to the ID in the spreadsheet URL; restart the server.

The feedback form saves timestamp and feedback. Only an explicitly checked consent box adds the selected area IDs, year, category and optional preferences. No chat history or financial fields are collected. Submissions are validated, limited to five/minute/IP, written as `RAW` values and protected against formula prefixes. Storage failures are isolated from the dashboard. Limit spreadsheet access and set your own retention/deletion policy. Google credentials never go to the browser.

## IONOS Linux deployment (manual; no deployment performed)

These commands assume an Ubuntu Linux server with root/sudo access, a domain you control, and this project pushed to your GitHub repository. Substitute your hostname and SSH user. Never include secret values in shell command history.

### 1. SSH, DNS and runtime

Point an **A** record for `cost.example.com` to the server's public IPv4 address in your DNS panel. Add AAAA only if the server's IPv6 actually works. Wait for DNS propagation. In the IONOS firewall and host firewall, allow your SSH port and inbound 80/443; do not expose 3001 publicly.

```sh
ssh your-user@your-server-ip
sudo apt update
sudo apt install -y nginx git certbot python3-certbot-nginx
```

Install the latest patched **Node 24 LTS** from https://nodejs.org/en/download using the official Linux instructions (preserve signature/checksum verification). Confirm `node --version` and `npm --version`. Use a dedicated unprivileged app user and run application commands as that user. PM2 should use the same Node installation:

```sh
sudo npm install -g pm2
sudo mkdir -p /var/www/metrolens
sudo chown "$USER":"$(id -gn)" /var/www/metrolens
git clone https://github.com/mujahid346/Cost-of-Living-website.git /var/www/metrolens
cd /var/www/metrolens
npm ci
cp .env.example .env
chmod 600 .env
nano .env
```

Set `DATA_MODE=live`, `BEA_API_KEY`, optional `OPENAI_API_KEY`, `OPENAI_MODEL`, `PORT=3001`, and `TRUST_PROXY=1`. Optional Sheets settings are above. Do not use `sudo npm start`. If you use a separate app account, assign checkout and cache ownership to that account.

### 2. Build and run

```sh
cd /var/www/metrolens
npm test
npm run build
pm2 start npm --name metrolens -- start
pm2 save
pm2 startup
```

Run the exact privileged startup command printed by `pm2 startup`, then `pm2 save`. Keep dev dependencies installed: the current start command uses `tsx`. Test the server internally:

```sh
curl --fail http://127.0.0.1:3001/api/health
curl --fail http://127.0.0.1:3001/api/data -o /tmp/metrolens-data.json
pm2 logs metrolens --lines 30
```

Inspect mode, freshness and warnings in the data response; a health response alone does not validate BEA access.

### 3. Nginx and HTTPS

Create `/etc/nginx/sites-available/metrolens`:

```nginx
server {
    listen 80;
    server_name cost.example.com;
    client_max_body_size 20k;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # Overwrite untrusted incoming forwarding headers: exactly one proxy.
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 240s;
    }
}
```

```sh
sudo ln -s /etc/nginx/sites-available/metrolens /etc/nginx/sites-enabled/metrolens
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d cost.example.com
sudo certbot renew --dry-run
```

Choose HTTPS redirect when prompted. Verify the public dashboard, `/api/data`, mobile layout and certificate after deployment. Bind/firewall port 3001 so traffic can reach it only through the trusted proxy. Do not configure `TRUST_PROXY=1` while directly exposing the backend to untrusted users.

### 4. Updates and maintenance

Commit/push reviewed local source first. On the server, retain `.env`, external service account key and `.cache`, then:

```sh
cd /var/www/metrolens
git pull --ff-only
npm ci
npm test
npm run build
pm2 restart metrolens --update-env
pm2 save
```

Back up configuration securely; never commit credentials. Monitor PM2/Nginx logs, BEA freshness and disk space. Keep Node's LTS patch version and dependencies updated. Required outbound services: `apps.bea.gov`, `api.openai.com` when using AI, and `oauth2.googleapis.com` / `sheets.googleapis.com` when using Sheets; package installation uses npm registries. Live upstream behavior and server deployment need your credentials and host access.

## Verification

`npm test` checks BEA parsing and error objects, missing data, percentage baselines, same-year rankings, upstream retry behavior, spreadsheet formula safety, API validation and safe error responses. Browser checks use system Chromium via Playwright (`tests/browser-check.ts`); start the production server first, then run `npx tsx tests/browser-check.ts`. Screenshots are generated under `.cache/`.
