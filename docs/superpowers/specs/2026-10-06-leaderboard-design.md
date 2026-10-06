# Timed AI Games + Leaderboard — Design

Extends `2026-10-05-nim-game-design.md`. Same rules: piles 1-3-5-7, misère (taking the last match loses).

## Goal
Measure how long a player takes to beat the AI and keep a public leaderboard; the winner enters a username after the win. Times must be trustworthy, so AI games run on the server.

## Decisions
- Server-timed AI games (anti-cheat): the server owns the game state and the clock.
- Storage: SQLite via `better-sqlite3`, path from env `LEADERBOARD_DB` (default `./data/leaderboard.db`). Needs a persistent volume in production.
- Only games where the **AI moves first** can be ranked (1-3-5-7 is a second-player win, so only then can a human win against the perfect AI). Player-first games are playable but unranked.
- If the server is unreachable, "Play vs AI" falls back to the existing local game, labelled "unranked".
- Names: 1-16 chars from letters, digits, space, `_`, `-`; trimmed; compared case-insensitively. No accounts, so names are not owned.
- Ranking: fastest time first; best time per name kept; Leaderboard screen shows top 20.

## Server
- `server/src/index.ts`: the `ws` server is attached to a Node `http` server (instead of `WebSocketServer({port})`) so it can also serve `GET /leaderboard` (JSON `{entries:[{name,timeMs,at}]}` top 20) with CORS (`Access-Control-Allow-Origin` from env `ALLOWED_ORIGIN`, default `*`). All existing protections stay (maxPayload, ws error handler, heartbeat, unjoined timeout).
- `server/src/aiGames.ts` (pure, injectable clock `now()`): `AiGameManager`
  - `start(connId, first: 'player'|'ai')` → creates `GameState` (player = seat 0, AI = seat 1, `turn` per `first`), plays the AI's opening move immediately if the AI is first; records `startedAt = now()`; one active AI game per connection (a new start replaces it).
  - `move(connId, move)` → validates with shared `isLegalMove`/`applyMove`, applies the AI reply with `aiMove` immediately; returns the state and, when the player wins, `{won: true, timeMs, claimToken}` only if the game was ranked (AI moved first). Unknown connection, out-of-turn, illegal move, finished game → error.
  - Claim tokens: `crypto.randomUUID()`, single-use, bound to `{timeMs}`, expire after 10 min; `claim(token)` returns timeMs and consumes it.
  - `drop(connId)`; `sweep()` removes games idle > 10 min.
- `server/src/leaderboard.ts`: `Leaderboard` class over SQLite (`:memory:` allowed).
  - `submit(name, timeMs): { rank: number }` — validates name; keeps the best time per case-insensitive name (a slower result for an existing name does not replace it, but still returns that name's current rank); display name uses the casing of the best entry.
  - `top(limit: number): {name, timeMs, at}[]` — fastest first.
- Rate limit: max 5 `submit-score` messages per connection per minute.

## Protocol additions (`shared/src/protocol.ts`)
ClientMsg: `{type:'ai-start'; first:'player'|'ai'}` | `{type:'ai-move'; move:Move}` | `{type:'submit-score'; claimToken:string; name:string}`
ServerMsg: `{type:'ai-state'; state:GameState; ranked:boolean}` | `{type:'ai-won'; timeMs:number; claimToken:string}` | `{type:'score-saved'; rank:number}` | existing `error`.
(`ai-state` after a player move already includes the AI's reply; when the player loses the state has `winner = 1`.)

## Web
- `useServerAiGame(first)` hook: implements `GameApi` (existing type) plus `{ranked: boolean; startedAt…; won?: {timeMs, claimToken}; submitScore(name): Promise<rank>}`. It keeps the existing 600 ms cosmetic delay before showing the AI's reply. Falls back to `useLocalGame` (unranked, with a notice) if the WebSocket cannot connect within ~3 s.
- Game screen: running timer (display only) for ranked games; win screen shows the final server time (m:ss.cs) and a name form (validated client-side with the same rule), then the rank; "Play again" / "Leaderboard".
- New `Leaderboard` screen (top 20 from `GET {server}/leaderboard`, loading/empty/error states); a "Leaderboard" button on Home. Setup screen hints that only "AI goes first" games are ranked.
- Styling follows the existing wooden-table theme.

## Testing
- Server: `aiGames` unit tests (fake clock: player-first win unranked; AI-first perfect-play win ranked with exact timeMs; out-of-turn/illegal/after-over rejected; token single-use, expiry, wrong token); `leaderboard` tests (`:memory:`: ordering, best-per-name, case-insensitive dedupe, name validation, rank); wire tests (full ranked flow with a scripted perfect player, token reuse rejected, bad name rejected, rate limit, `GET /leaderboard` incl. CORS header, malformed frames still do not crash the server).
- Web: hook tests with a fake WebSocket (ranked flow, fallback to local, submit), Leaderboard screen tests, name-validation tests, time-format tests. Existing tests stay green.
- A scripted perfect human (nim-sum) must be able to beat the AI when the AI moves first; that is the end-to-end proof that ranked wins are reachable.

## Deployment
Dockerfile installs `better-sqlite3` (prebuilt binary or build tools on alpine), creates `/data` and sets `LEADERBOARD_DB=/data/leaderboard.db`. README documents mounting a persistent volume (Fly volume, Railway volume, Render disk) and `ALLOWED_ORIGIN`.

## Out of scope
Accounts/reserved names, profanity filter, history of all runs, PvP leaderboard, per-day/weekly boards.
