# Production deployment (VPS + Coolify) — DONE

The game backend is **PocketBase** (realtime over **SSE** — no WebSockets, which is why
it works on this VPS where the Convex WebSocket never did). There is no server-side code:
collections + API rules (see `pb/setup.mjs`) enforce the game's security, and game logic
lives in the browser (`src/lib/engine.ts`).

## Current production setup (deployed 2026-09-22)

| What | Value |
|---|---|
| Coolify app | `faker-pocketbase` (uuid `l17tylnrqv83xptm6fttlujw`), environment `game box`, docker image `ghcr.io/muchobien/pocketbase:latest` |
| Public URL | `http://pb.169.58.224.56.sslip.io` |
| Admin dashboard | `http://pb.169.58.224.56.sslip.io/_/` |
| Superuser | `admin@faker.local` — password in `pb/.prod-superuser-pass` (gitignored) |
| Persistent volumes | `faker-pb-data` → `/pb_data`, `faker-pb-hooks` → `/pb_hooks` |
| Frontend | `PUBLIC_POCKETBASE_URL` in `.env.local` points at the public URL; it is baked into `dist/` at build time |

Verified on production: `/api/health`, 59/59 rule smoke tests, SSE stream through the
Coolify proxy (`PB_CONNECT` arrives unbuffered), game create/join with live lobby updates
from two browsers.

## Common operations

```bash
# re-provision / update collections + rules after changing pb/setup.mjs
node pb/setup.mjs http://pb.169.58.224.56.sslip.io admin@faker.local "$(cat pb/.prod-superuser-pass)"

# rule regression check against production
node pb/smoke.mjs http://pb.169.58.224.56.sslip.io

# rebuild the frontend after any change (prod URL comes from .env.local)
npm run build
```

- **Redeploy/restart/stop PocketBase**: Coolify UI or API
  (`POST /api/v1/applications/l17tylnrqv83xptm6fttlujw/start|restart|stop`).
- **Backups**: everything lives in the `faker-pb-data` volume (`/pb_data`).
- **HTTPS**: currently plain HTTP (like the Coolify panel itself). To switch, set the
  app domain to `https://pb.169.58.224.56.sslip.io` in Coolify (Let's Encrypt for
  sslip.io works if port 80 is reachable) and rebuild the frontend with the new URL.
- **Old backend**: the `convex` Coolify service is no longer used by this game and can be
  stopped/deleted whenever nothing else depends on it.
- **Upgrades**: change the image tag and redeploy; `/pb_data` persists data. Read the
  PocketBase release notes for breaking changes.

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
