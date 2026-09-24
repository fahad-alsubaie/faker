# AGENTS.md

Instructions for AI coding agents working in this repository.

## Project Overview

**Faker (فاكر)** — a real-time Arabic multiplayer party game (3–12 players) inspired by Jackbox. Players answer personal questions in setup, then each round everyone writes fake answers to a question about one target player and votes on which answer is real. Scoring: +100 per player tricked by your fake answer, +100 for correctly picking the real answer.

- **All UI text is Arabic. Layout is RTL** (`<html lang="ar" dir="rtl">` in `src/layouts/Layout.astro`). Never introduce English UI strings.
- Questions pool (20 Arabic personal questions): `ARABIC_QUESTIONS` in `src/lib/engine.ts`.

## Tech Stack

- **Astro 4** (`output: 'static'`) with **React 18 islands** — every interactive component is mounted with `client:only="react"` (no SSR of islands).
- **PocketBase** (self-hosted, v0.40.x) for database + auth + **realtime over SSE** (PocketBase realtime is SSE-based — no WebSockets, which is exactly why it replaces the old Convex backend whose WebSocket never worked on this VPS).
- **Tailwind CSS 3** via `@astrojs/tailwind`.
- No server-side game code: **PocketBase API rules enforce security** (see `pb/setup.mjs`), **game logic runs in the browser** (`src/lib/engine.ts`).

## Commands

```bash
npm run dev                 # Astro dev server (port 4321)
npm run build               # production build (must pass before finishing work)
npm run pb:setup:local      # provision collections + rules on local PB (127.0.0.1:8090)
npm run pb:smoke:local      # 59 API-rule assertions against local PB
node pb/setup.mjs <url> <su_email> <su_pass>   # provision any PB instance (idempotent)
node pb/smoke.mjs <url>                        # rule regression check
```

- Local PocketBase binary + pb_data live in `../pocketbase/` (relative to v3/).
  Run: `cd ../pocketbase && ./pocketbase.exe serve --http=127.0.0.1:8090`
  Local superuser: `admin@faker.local` / `faker-dev-admin-2026` (dev only).
- `PUBLIC_POCKETBASE_URL` is **baked at build time** (Astro static output). `.env` points
  at local PB; `.env.local` overrides for production (currently
  `http://pb.169.58.224.56.sslip.io` — the live VPS instance). Production: repo
  https://github.com/fahad-alsubaie/faker → Coolify `faker-web` (Dockerfile + nginx) at
  http://faker.169.58.224.56.sslip.io. See `DEPLOY.md`.
- Multiple unrelated Astro dev servers may run on this machine. Before testing, verify
  port 4321 actually serves THIS project — kill stray `node ... astro dev` processes if
  another project answers. Start with `npx astro dev --host` if you need `127.0.0.1:4321`
  as a second origin (useful for two-player browser tests with separate localStorage).

## Architecture

### Realtime: PocketBase SSE subscriptions (no polling)

`src/hooks/usePb.ts` provides the data layer:

- `usePbRecord(collection, recordId)` / `usePbList(collection, filter, sort)` — fetch once,
  then subscribe via `pb.collection(...).subscribe(filter, cb)` (SSE) and refetch on every
  event. Safety nets on top of SSE: 20s interval refetch + refetch on tab visibility.
  Pass `undefined` as filter to disable a query.
- `useAuthGate()` — restores auth from the stored identity (username+password re-auth)
  before subscriptions start. Gate list hooks on `ready`.
- `pb.autoCancellation(false)` is set in `src/lib/pb.ts` — parallel subscriptions must not
  cancel each other.

### Auth model: every player is a PocketBase auth record

- `players` is an **auth collection** with custom `username` (random, e.g. `p4v5u46isxqdo9h`)
  and a random 20-char password. Credentials + `{gameId, playerId, code, name, isHost}`
  live in localStorage key `faker_player` (`src/lib/storage.ts`).
- Identity lifecycle: host signs up (`isHost:true, game:""` → creates game → claims it by
  patching own `game`), joiners sign up with `game:<id>, isHost:false` (rule rejects join
  once the game left `lobby`). Reconnect = `authWithPassword(username, password)`.
- Unlike the old Convex flow, joining with a taken name is **rejected** (no hijack by name).

### PocketBase collections (`pb/setup.mjs` is the source of truth)

`games`, `players` (auth), `personalQuestions`, `personalAnswers` (secret setup answers),
`rounds`, `answers` (real + bluffs), `votes`. Key security rules:

- **Phase-gated visibility**: personalAnswers readable only by owner during setup;
  answers (bluffs) readable by author during answering; votes readable by voter until the
  round hits `results`.
- **State machine on `games.status`**: `lobby → setup → answering → voting → results → …`
  transitions enforced IN the update rule — forward phase flips allowed for any game
  member; structural transitions (start, advance, finish, reset-to-lobby) host-only.
- **Uniqueness**: one game per code, one round per (game, roundNumber), one answer per
  (round, player), one vote per (round, voter).
- Known leaks (party-game threat model, same as the old Convex implementation): answer
  authorship + `isReal` are technically visible in voting-phase payloads; scores are
  computed client-side.
- PocketBase gotchas encoded in `pb/setup.mjs`: required number/bool fields **reject
  0/false** (such fields are optional); the `~` rule operator is LIKE/contains, not regex
  (code format enforced via field `pattern`); the raw Admin API does **not** add system
  `id/created/updated` fields automatically (they are declared explicitly); `email` on auth
  collections is re-declared as optional; update/delete rule failures return **404**.

### Game flow (engine in `src/lib/engine.ts`)

`lobby → setup → answering → voting → results → finished`

- **Setup**: host creates 1 personal question per player (`startGame`); players answer
  (`submitPersonalAnswer` writes `personalAnswers` + stamps `answeredAt`).
- **Round start**: when all questions are answered, the HOST's watchdog effect calls
  `startRound` (idempotent): patches game → `answering`, picks subject
  `orderedPlayers[currentRoundIndex]`, picks an unused answered question of the subject
  (fallback: any unused answered question), creates the round + the real-answer row.
- **Phase transitions without server code**: each submitter stamps `bluffedRound` /
  `votedRound` on their OWN player record (players are publicly visible in-game, so
  everyone can count completions in realtime). The last submitter flips the phase; a
  host watchdog effect (`GameContainer`) re-checks every realtime tick as a race backstop.
- **Subject sits out**: no bluff, no vote (enforced by rules + engine).
- **Scores are computed client-side** from finished rounds' votes (`computeScores`) —
  there is no score column anywhere.
- **Reset ("play again")**: host deletes votes → answers → rounds → personalAnswers →
  questions in order (plain deletes; don't rely on cascade for non-superusers), then
  patches the game back to `lobby`. Same code, same players, scores zero out because
  rounds are gone.

### Critical: static output — never read URL params server-side

With `output: 'static'`, `Astro.request.url` is evaluated at **build time**. Always read
params **client-side** inside the island component:

```tsx
const [code] = useState(() => new URLSearchParams(window.location.search).get("code") || "");
```

Pages: `/` (home, join deep-link via `/?code=XXXX`), `/lobby?code=XXXX`, `/game?gameId=...`.
Each page renders ONE `client:only="react"` island (`HomePage`, `LobbyPage`, `GamePage`).

### Old Convex backend

Removed from the app. `_convex_backup/` and the `convex/` folder keep the old code for
reference (nothing imports it). The Convex service still runs on the VPS (Coolify service
`convex`) and can be stopped when no longer needed — see `DEPLOY.md`.

## Conventions

- No comments in code unless asked.
- Arabic strings in UI; keep numerals/latin (codes, timers) LTR-friendly (`dir-ltr` on the code input).
- Tailwind utility classes only; custom keyframes in `tailwind.config.mjs`.
- Verify with `npm run build` before finishing; after touching `pb/setup.mjs`, re-provision
  (`npm run pb:setup:local`) and re-run `npm run pb:smoke:local`.
- E2E check by hand: two browser tabs on two origins (`localhost:4321` and `127.0.0.1:4321`
  → separate localStorage per origin) playing a full game.
