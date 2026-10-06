# Nim Game — Design

## Goal
A React Nim game playable against an AI or against another person online. Personal/portfolio project. Web app on Vercel; separate small Node server for PvP.

## Rules
- Piles: 1, 3, 5, 7.
- A move removes 1..n matches from a single pile.
- Misère: whoever takes the last match **loses**.
- 1-3-5-7 is a second-player win with perfect play.

## Decisions
- TypeScript throughout, npm workspaces monorepo.
- AI: perfect only, no difficulty levels. Player chooses who moves first in AI games.
- PvP: room codes (create/join), no matchmaking queue.
- Server is authoritative; it validates every move with the shared rules.
- Vercel hosts the web app only (no WebSockets); server hosted on Render/Fly/Railway.

## Layout
- `shared/` — pure game logic + tests
- `web/` — Vite + React app (Vercel)
- `server/` — Node `ws` server

## shared
- State: `{ piles: number[], turn: 0 | 1, winner: null | 0 | 1 }`.
- `applyMove(state, { pile, count })`: validates (1 ≤ count ≤ piles[pile], game not over), returns new state. If all piles are empty after the move, the mover loses (winner = other player).
- `aiMove(state)`: the classic Nim strategy (nim-sum / XOR), misère version. Let big = piles with ≥ 2 matches.
  - ≥ 2 big piles: play normal Nim. X = XOR of all piles; if X ≠ 0, reduce a pile p with (p XOR X) < p to p XOR X. If X = 0 (losing), take 1 from the largest pile.
  - Exactly 1 big pile: reduce it to 0 or 1 so that an odd number of 1-piles remain.
  - No big piles: take one match from a pile of 1.
- Tests: move validation, win detection, and a brute-force cross-check that the AI never loses from a winning position (the brute force is a test oracle only, not shipped).

## web
- Screens: Home (vs AI / Play online), Setup (who moves first), Game, Join/Create room.
- Board: 4 rows of matches. Click a match to select it and all after it in the row, then confirm.
- `useGame` hook with a common interface and two backends: local (calls `aiMove` after a short "thinking" delay) and online (WebSocket). The board is backend-agnostic.
- Server URL from `VITE_SERVER_URL`.

## server
- In-memory rooms keyed by short code.
- Messages: `create`, `join`, `move`, `state`, `error`, plus opponent connect/disconnect notices.
- Each player gets a token on join; reconnect within ~30 s with the token restores the seat. Otherwise the room is dropped. Idle rooms expire.

## Testing
- Vitest for shared rules and AI.
- Server tests with two scripted WebSocket clients: full game, illegal move, disconnect/reconnect.
- Manual browser play-through for UI.

## Out of scope
Accounts, ratings, matchmaking queue, chat, spectators, AI difficulty levels.
