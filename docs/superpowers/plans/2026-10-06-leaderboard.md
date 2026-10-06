# Timed AI Games + Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Do not run any git commands (no commit, no push); the user handles git.**

**Goal:** AI games run on the server, which times them; a player who beats the AI (only possible when the AI moves first) enters a username and lands on a persistent top-20 leaderboard.

**Architecture:** The existing `server/` gains an `http` server (so `GET /leaderboard` works beside the WebSocket), a pure `AiGameManager` (server-owned AI games + claim tokens) and a SQLite-backed `Leaderboard`. Web gets a `useServerAiGame` hook (falls back to the existing local game when the server is unreachable), a timer, a name form and a Leaderboard screen.

**Tech Stack:** TypeScript, `better-sqlite3`, `ws`, Node `http`, Vitest, React 18 (existing).

**Spec:** `docs/superpowers/specs/2026-10-06-leaderboard-design.md` (extends `docs/superpowers/specs/2026-10-05-nim-game-design.md`). Existing code: `shared/`, `server/`, `web/` (workspaces `@nim/shared`, `@nim/server`, `@nim/web`).

## Global Constraints

- Piles `[1,3,5,7]`, misère: whoever takes the last match loses. Player = seat 0, AI = seat 1.
- Only games where the AI moves first are ranked; player-first games are playable but unranked.
- Names: 1-16 chars from letters, digits, space, `_`, `-`; trimmed; compared case-insensitively; best time per name kept; ranking fastest first; top 20 shown.
- Claim token: `crypto.randomUUID()`, single-use, bound to its `timeMs`, expires after 10 minutes. AI games idle > 10 minutes are dropped. Max 5 `submit-score` per connection per minute.
- SQLite via `better-sqlite3`; path from env `LEADERBOARD_DB` (default `./data/leaderboard.db`); CORS origin from env `ALLOWED_ORIGIN` (default `*`).
- Server keeps all existing protections (maxPayload 4096, ws `error` handler, heartbeat, unjoined timeout) and must not crash on malformed input.
- If the server is unreachable (no open WebSocket within ~3 s), "Play vs AI" falls back to the existing local game, labelled "unranked".
- Time display format `m:ss.cs` (e.g. 83450 ms → `1:23.45`). Keep the existing wooden theme; keep all existing tests green.
- Out of scope: accounts/reserved names, profanity filter, run history, PvP leaderboard, weekly boards.

## Review Focus

- Claim token reuse, unknown token, and expired token on `submit-score` → `error`, nothing stored.
- Names: empty/whitespace-only, 17 chars, emoji/symbols, leading/trailing spaces, same name in different case (`Ann` vs `ann`) → rejected or deduped per rule.
- A slower result for an existing name never replaces its better time.
- Player-first win-impossible path: a player-first game never yields a claim token; an AI-first game where the player plays the nim-sum strategy does (end-to-end proof wins are reachable).
- Moves in a finished/unknown AI game, out of turn, or illegal counts → `error`, state unchanged; second `ai-start` replaces the first game.
- Connection drops mid-game → game dropped; connection drops right after winning but before the name is submitted → the game is gone but the claim token stays valid for 10 minutes and may be submitted from a new connection.
- `GET /leaderboard` on an empty DB → `{entries: []}`; CORS preflight (`OPTIONS`) answered; unknown paths → 404; leaderboard screen shows loading/empty/error states.
- `submit-score` flood (6th in a minute) → rate-limited `error`.

---

## File Structure

```
shared/src/protocol.ts   (modify) new message types + LeaderboardEntry
shared/src/name.ts       (create) validateName
server/src/leaderboard.ts, aiGames.ts   (create)
server/src/index.ts      (modify) http server, /leaderboard, ai-* handlers
server/test/leaderboard.test.ts, aiGames.test.ts   (create), server.test.ts (extend)
web/src/format.ts, api.ts, hooks/useServerAiGame.ts (create) + tests
web/src/screens/Leaderboard.tsx, WinPanel (component) (create); Game.tsx, Home.tsx, Setup.tsx, App.tsx, styles.css (modify)
server/Dockerfile, README.md (modify)
```

### Task 1: Protocol types, `validateName`, `Leaderboard` store

**Files:** Modify `shared/src/protocol.ts`, `shared/src/index.ts`, `server/package.json` (add `better-sqlite3`, `@types/better-sqlite3`); Create `shared/src/name.ts`, `shared/test/name.test.ts`, `server/src/leaderboard.ts`, `server/test/leaderboard.test.ts`.

**Interfaces:**
- Produces in `@nim/shared`:
  - `type LeaderboardEntry = { name: string; timeMs: number; at: number }`
  - ClientMsg additions: `{type:'ai-start'; first:'player'|'ai'}`, `{type:'ai-move'; move:Move}`, `{type:'submit-score'; claimToken:string; name:string}`
  - ServerMsg additions: `{type:'ai-state'; state:GameState; ranked:boolean}`, `{type:'ai-won'; timeMs:number; claimToken:string}`, `{type:'score-saved'; rank:number}`
  - `validateName(raw: string): string | null` — returns the trimmed name if it matches `/^[A-Za-z0-9 _-]{1,16}$/` after trimming, else `null`
- Produces in `server/src/leaderboard.ts`: `class Leaderboard` with `constructor(dbPath?: string)` (default `':memory:'`; creates the table if missing), `submit(name: string, timeMs: number, at?: number): { rank: number } | { error: string }`, `top(limit: number): LeaderboardEntry[]`, `close(): void`. Rank = 1-based position of that name's best entry (ties: earlier `at` first). Invalid name or non-positive/non-integer `timeMs` → `{error}`. A slower result for an existing name (case-insensitive) is ignored but returns the current rank; a faster one replaces it and takes the new casing.

- [ ] **Step 1:** Write `name.test.ts` (valid: `"Ann"`, `" Bob_1 "` → `"Bob_1"`, 16 chars ok; invalid: `""`, `"   "`, 17 chars, `"a😀"`, `"x;y"`) and `leaderboard.test.ts` (`:memory:`): ordering fastest-first; rank values; best-per-name keeps the faster time; slower resubmission returns current rank and stores nothing; `Ann` vs `ann` dedupe; casing of the faster entry wins; invalid name and `timeMs` 0 / -5 / 1.5 → error; `top(2)` limits; data persists across two `Leaderboard` instances on the same temp file path (use `os.tmpdir()`).
- [ ] **Step 2:** Run `npx vitest run` in `shared/` and `server/` → FAIL.
- [ ] **Step 3:** Implement the types, `validateName` (export from `index.ts`) and `Leaderboard` (SQLite table `scores(name_key TEXT PRIMARY KEY, name TEXT, time_ms INTEGER, at INTEGER)`; upsert only if faster; rank via count of entries with smaller `time_ms`, or equal time and earlier `at`, plus 1). Install deps with `npm install` at the root.
- [ ] **Step 4:** Run both suites → PASS.

### Task 2: `AiGameManager`

**Files:** Create `server/src/aiGames.ts`, `server/test/aiGames.test.ts`.

**Interfaces:**
- Consumes: `GameState`, `Move`, `initialState`, `isLegalMove`, `applyMove`, `aiMove` from `@nim/shared`
- Produces: `class AiGameManager` with
  - `constructor(opts?: { now?: () => number; tokenTtlMs?: number; idleMs?: number })` (defaults 600000 each)
  - `start(connId: string, first: 'player' | 'ai'): { state: GameState; ranked: boolean }` — player = seat 0, AI = seat 1; if `first === 'ai'` the AI's opening move is already applied; `ranked = (first === 'ai')`; replaces any existing game for the connection; records `startedAt = now()`
  - `move(connId: string, move: Move): { state: GameState; won?: { timeMs: number; claimToken: string } } | { error: string }` — rejects unknown connection, finished game, illegal move; applies the player's move, then the AI's reply (`aiMove`) if the game is not over. When the AI is forced to take the last match (player wins) and the game is ranked, `won = { timeMs: now() - startedAt (measured at the moment the player's move is received), claimToken }`. A player win in an unranked game returns no `won`.
  - `claim(token: string): number | null` — returns the token's `timeMs` and consumes it; `null` if unknown, used or expired
  - `drop(connId: string): void`, `sweep(): void` (removes games idle > `idleMs` and expired tokens)

- [ ] **Step 1:** Write `aiGames.test.ts` with a fake clock: AI-first start has one move already applied and `ranked: true`; player-first start is `ranked: false`; a scripted perfect player (using `aiMove` for the player's turns) beats an AI-first game and gets `won` with `timeMs` exactly equal to the fake-clock difference; the same loop in a player-first game never yields `won`; `claim` returns the time once then `null`; `claim` after `tokenTtlMs` → `null`; moves in unknown/finished game, illegal counts (0, -1, 1.5, too many, bad pile) → `{error}`; second `start` replaces the first; `sweep()` drops idle games; the game state is not mutated by a rejected move.
- [ ] **Step 2:** Run `npx vitest run` in `server/` → FAIL.
- [ ] **Step 3:** Implement `AiGameManager` (store `{state, ranked, startedAt, lastActive}` per connId and a `Map<token, {timeMs, expiresAt}>`).
- [ ] **Step 4:** Run → PASS.

### Task 3: Server integration (HTTP + WebSocket handlers)

**Files:** Modify `server/src/index.ts`, `server/test/server.test.ts`.

**Interfaces:**
- Consumes: `AiGameManager`, `Leaderboard`, `validateName`, new protocol messages
- Produces: `startServer(port: number, opts?: { leaderboardDb?: string; allowedOrigin?: string; now?: () => number; heartbeatMs?: number; … existing options })` still returns `{ close(): Promise<void>; port: number }`; `close()` also closes the HTTP server and the leaderboard DB. Env defaults when run directly: `LEADERBOARD_DB` (default `./data/leaderboard.db`, create the directory), `ALLOWED_ORIGIN` (default `*`).
- HTTP: `GET /leaderboard` → 200 JSON `{ entries: LeaderboardEntry[] }` (top 20) with `Access-Control-Allow-Origin: <allowedOrigin>`; `OPTIONS /leaderboard` → 204 with `Access-Control-Allow-Origin/Methods/Headers`; any other path → 404. The `ws` server attaches to the same `http` server with the existing `maxPayload: 4096`.
- WebSocket: `ai-start` → `ai-state`; `ai-move` → `ai-state`, plus `ai-won {timeMs, claimToken}` after it when `won`; errors reply `{type:'error'}`; `submit-score {claimToken, name}` → `claim` the token (invalid → error), `validateName` (invalid → error, token NOT consumed: validate the name before claiming), `leaderboard.submit`, reply `score-saved {rank}`; rate limit of 5 `submit-score` per connection per rolling minute (injected `now`) → `error` "too many submissions". A closing socket calls `aiGames.drop`; the existing 5 s sweep also calls `aiGames.sweep()`. A connection already in a PvP room may still start an AI game (independent).

- [ ] **Step 1:** Extend `server.test.ts` (start on port 0 with a temp-file or `:memory:` DB): full ranked flow — client sends `ai-start {first:'ai'}`, plays the nim-sum strategy via `aiMove` from `@nim/shared` until `ai-won`, submits a name, gets `score-saved {rank:1}`, and `GET /leaderboard` (Node `fetch`) lists it; token reuse → error; bad name → error and the same token can then be used with a valid name; unknown token → error; 6th `submit-score` within a minute → rate-limit error; player-first game never produces `ai-won`; `GET /leaderboard` on empty DB → `{entries:[]}`; `OPTIONS` returns 204 with the CORS headers; `GET /nope` → 404; `ai-move` before `ai-start` → error; existing malformed-frame tests still pass.
- [ ] **Step 2:** Run `npx vitest run` in `server/` → FAIL.
- [ ] **Step 3:** Implement: replace `new WebSocketServer({ port, ... })` with `http.createServer(handler)` + `new WebSocketServer({ server, maxPayload: 4096 })`, listen on `port`, wire the new message types in the existing dispatcher (inside its try/catch), clean up in `close()`.
- [ ] **Step 4:** Run the full server suite → PASS (all pre-existing tests included).

### Task 4: Web helpers + `useServerAiGame`

**Files:** Create `web/src/format.ts`, `web/src/api.ts`, `web/src/hooks/useServerAiGame.ts` and tests `format.test.ts`, `api.test.ts`, `hooks/useServerAiGame.test.ts`.

**Interfaces:**
- Consumes: `GameApi` (`web/src/types.ts`), `ClientMsg`/`ServerMsg`, `LeaderboardEntry`, `validateName`; the server URL from `import.meta.env.VITE_SERVER_URL ?? 'ws://localhost:8080'`
- Produces:
  - `formatTime(ms: number): string` → `m:ss.cs` (`83450` → `"1:23.45"`, `0` → `"0:00.00"`, `59999` → `"0:59.99"`, `600000` → `"10:00.00"`)
  - `serverHttpBase(wsUrl: string): string` (`ws://` → `http://`, `wss://` → `https://`) and `fetchLeaderboard(baseUrl?: string): Promise<LeaderboardEntry[]>` (throws on non-OK or malformed JSON)
  - `type ServerAiApi = GameApi & { connection: 'connecting' | 'open' | 'failed'; ranked: boolean; won: { timeMs: number; claimToken: string } | null; submitScore(name: string): Promise<{ rank: number } | { error: string }> }`
  - `useServerAiGame(first: 'player' | 'ai', opts?: { WebSocketImpl?: typeof WebSocket; connectTimeoutMs?: number /* default 3000 */ }): ServerAiApi` — opens the socket, sends `ai-start`, mirrors `ai-state` into `state`/`myTurn`/`status` (seat 0 = the player; `won` status when `winner === 0`, `lost` when `winner === 1`); `play(move)` sends `ai-move` only when `myTurn` (and ignores repeated plays until the next `ai-state`/`error`, same lock idea as `useOnlineGame`); the AI's reply is shown after a 600 ms cosmetic delay; `ai-won` sets `won`; `submitScore` validates the name client-side (`validateName`, else `{error}`), sends `submit-score`, resolves on `score-saved`/`error`; `connection` becomes `'failed'` if the socket errors/closes before opening or does not open within `connectTimeoutMs`; socket and timers cleaned up on unmount (StrictMode-safe: one `ai-start` only); malformed server messages ignored.

- [ ] **Step 1:** Write the tests (fake WebSocket + fake timers): `formatTime` cases above; `serverHttpBase`; `fetchLeaderboard` with mocked `fetch` (ok / non-OK / malformed → throws); hook: sends one `ai-start` with the right `first` even under `<StrictMode>`; `ai-state` updates state and `myTurn`; `play` sends `ai-move` once and blocks repeats; AI reply appears only after 600 ms; `ai-won` sets `won`; `submitScore` with invalid name resolves `{error}` without sending; valid name sends `submit-score` and resolves `{rank}` on `score-saved`; no open within 3 s → `connection:'failed'`; socket closed before open → `'failed'`; unmount closes the socket and no timers fire afterwards.
- [ ] **Step 2:** Run `npx vitest run` in `web/` → FAIL.
- [ ] **Step 3:** Implement the helpers and the hook.
- [ ] **Step 4:** Run → PASS; run `npx tsc --noEmit -p .` in `web/` → clean.

### Task 5: Screens — timer, win panel, Leaderboard, wiring

**Files:** Create `web/src/screens/Leaderboard.tsx`, `web/src/components/WinPanel.tsx`, `web/src/components/Timer.tsx`, tests `Leaderboard.test.tsx`, `WinPanel.test.tsx`; Modify `App.tsx`, `Game.tsx`, `Home.tsx`, `Setup.tsx`, `styles.css`.

**Interfaces:**
- Consumes: `useServerAiGame`, `useLocalGame`, `formatTime`, `fetchLeaderboard`, `validateName`, `Board`, `Header`, theme classes
- Produces:
  - `Timer` props `{ startedAt: number; running: boolean }` — displays `formatTime` of elapsed (display only; ticks every 100 ms; stops when `running` is false)
  - `WinPanel` props `{ timeMs: number; onSubmit(name: string): Promise<{rank:number}|{error:string}>; onPlayAgain(): void; onLeaderboard(): void }` — shows the final time (`formatTime`), a name input with client-side validation message, a submit button (disabled while submitting), then the rank ("You are #N") and "Leaderboard"/"Play again" buttons; server errors shown
  - `Leaderboard` props `{ onBack(): void }` — fetches the top 20, shows loading / empty ("No wins yet — be the first!") / error ("Could not load the leaderboard") states, rank, name, time (`formatTime`)
  - App wiring: `Play vs AI` → Setup → ranked/unranked game: a wrapper component uses `useServerAiGame`; while `connection === 'connecting'` shows "Connecting…"; if `'failed'` renders the existing local game with the notice "Server unreachable — this game is unranked"; if `ranked` shows `Timer`; on `won` shows `WinPanel`. Home gets a "Leaderboard" button; Setup text hints "Only games where the AI goes first are ranked". The player-first win-impossible case simply ends as before.

- [ ] **Step 1:** Write tests: `Leaderboard` (loading → rows with formatted times; empty state; error state; Back); `WinPanel` (shows formatted time; invalid name shows a message and does not call `onSubmit`; valid name calls `onSubmit` once even on double-click; shows "You are #3" on `{rank:3}`; shows the server error text on `{error}`); `Timer` with fake timers (shows `0:00.00`, advances, stops when `running` false).
- [ ] **Step 2:** Run `npx vitest run` in `web/` → FAIL.
- [ ] **Step 3:** Implement the components and wiring; style them in the existing wooden theme (CSS variables in `styles.css`, 4.5:1 contrast for text).
- [ ] **Step 4:** Run all web tests and `npx tsc --noEmit -p .` → PASS/clean; run `npm run build -w @nim/web` and delete `web/dist`.
- [ ] **Step 5:** End-to-end smoke without a browser UI: start the server (`PORT=18080`, temp DB via `LEADERBOARD_DB`), run a throwaway Node script in the scratchpad that plays the nim-sum strategy through `ai-start {first:'ai'}` to a win, submits a name and fetches `GET /leaderboard`; kill the server and report honestly that the UI was not exercised.

### Task 6: Deployment and docs

**Files:** Modify `server/Dockerfile`, `README.md`, `.dockerignore` if needed; Create `server/.env.example` (`LEADERBOARD_DB`, `ALLOWED_ORIGIN`, `PORT`).

- [ ] **Step 1:** Dockerfile: make sure `better-sqlite3` installs on `node:22-alpine` (prebuilt binary or add `python3 make g++` build deps in the build stage); `mkdir /data` owned by `node`, `ENV LEADERBOARD_DB=/data/leaderboard.db`, `VOLUME /data`; still runs as `USER node`. README: how the leaderboard works (ranked = AI goes first, server-timed, names not owned), the persistent-volume requirement on Fly/Railway/Render (scores are lost on redeploy without it), `ALLOWED_ORIGIN` (set to the Vercel URL), local dev notes, and the corrected fact that the AI is beatable only by playing the nim-sum strategy when it moves first.
- [ ] **Step 2:** Verify: if `docker` exists, build the image, run it with a temp volume, connect a `ws` client that plays a ranked win and submits a name, restart the container with the same volume and confirm `GET /leaderboard` still lists the name; then remove the container/image/volume. Run `npx vitest run` in `shared/`, `server/`, `web/` → all pass; report the counts.
