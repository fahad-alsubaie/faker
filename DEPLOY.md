# Production deployment (VPS + Coolify)

The game backend is **PocketBase** (realtime over **SSE** — no WebSockets, which is why
it works on this VPS where the Convex WebSocket never did). There is no server-side code:
collections + API rules (see `pb/setup.mjs`) enforce the game's security, and game logic
lives in the browser (`src/lib/engine.ts`).

## Current production setup

| What | Value |
|---|---|
| GitHub repo | https://github.com/fahad-alsubaie/faker |
| **Game (frontend)** | **http://faker.169.58.224.56.sslip.io** — Coolify app `faker-web` (uuid `l1bq9nsjukrmd1ff6bqq2sbm`), built from the repo's `Dockerfile` (node build → nginx serves `dist/`) |
| Backend | Coolify app `faker-pocketbase` (uuid `l17tylnrqv83xptm6fttlujw`), docker image `ghcr.io/muchobien/pocketbase:latest` |
| Backend URL | `http://pb.169.58.224.56.sslip.io` (admin dashboard at `/_/`) |
| Superuser | `admin@faker.local` — password in `pb/.prod-superuser-pass` (gitignored) |
| PocketBase volumes | `faker-pb-data` → `/pb_data`, `faker-pb-hooks` → `/pb_hooks` |

The frontend image bakes `PUBLIC_POCKETBASE_URL` at build time from the Dockerfile
`ARG` (default: the production PocketBase URL). Locally, `.env.local` overrides it
for the dev server / local `npm run build`.

## Common operations

```bash
# deploy frontend changes: push to GitHub, then redeploy in Coolify
git push
curl -s -X POST -H "Authorization: Bearer $COOLIFY_TOKEN" \
  "$COOLIFY_URL/api/v1/applications/l1bq9nsjukrmd1ff6bqq2sbm/start" -d "{}" \
  -H "Content-Type: application/json"

# re-provision / update PocketBase collections + rules after changing pb/setup.mjs
node pb/setup.mjs http://pb.169.58.224.56.sslip.io admin@faker.local "$(cat pb/.prod-superuser-pass)"

# rule regression check against production
node pb/smoke.mjs http://pb.169.58.224.56.sslip.io

# rebuild the frontend locally (uses .env.local)
npm run build
```

- **Backups**: everything lives in the `faker-pb-data` volume (`/pb_data`).
- **HTTPS**: both sites are plain HTTP (like the Coolify panel itself). To switch, set the
  app domains to `https://…sslip.io` in Coolify (Let's Encrypt works for sslip.io if port
  80 is reachable) and update the Dockerfile ARG + `.env.local`, then redeploy.
- **Old backend**: the `convex` Coolify service is no longer used by this game and can be
  stopped/deleted whenever nothing else depends on it.
- **Upgrades**: change the image tag and redeploy; `/pb_data` persists data.

## Local development backend

```bash
cd ../pocketbase                 # local PocketBase binary lives there
./pocketbase.exe superuser upsert admin@faker.local faker-dev-admin-2026
./pocketbase.exe serve --http=127.0.0.1:8090
# in another terminal, from v3/:
npm run pb:setup:local           # provision collections + rules
npm run pb:smoke:local           # 59 rule assertions
```

To develop against the local backend, point `.env.local` at `http://127.0.0.1:8090`
(it overrides `.env`); switch it back before building for production.
