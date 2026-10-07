# Nim

Classic Nim, played in the browser against a perfect AI or against a friend online.

- Four piles of matches: against the machine each game deals a random board (1-7 per row); online games use the classic 1, 3, 5 and 7.
- On your turn remove 1 or more matches from a single pile.
- Misère rule: whoever takes the last match **loses**.
- The AI uses the nim-sum (XOR) strategy, with the misère endgame handled separately. It plays perfectly, choosing at random among equally good moves so games don't repeat; whether you can beat it depends on the deal and who moves first. In AI games you choose who moves first.
- Online play uses room codes (create / join) or an invite link (`/?room=CODE`) that drops the friend straight into the room; the server is authoritative and supports reconnecting within about 30 seconds.

## Layout

npm workspaces: `shared` (`@nim/shared`, rules and AI), `server` (`@nim/server`, WebSocket server), `web` (`@nim/web`, Vite + React).

## Local development

```sh
npm install

# terminal 1: server on ws://localhost:8080 (override with PORT)
npm start -w @nim/server

# terminal 2: web dev server
npm run dev -w @nim/web
```

The web app reads the server URL from `VITE_SERVER_URL` (falls back to `ws://localhost:8080`). Copy `web/.env.example` to `web/.env` to override it.

### Tests

```sh
npm test -w @nim/shared
npm test -w @nim/server
npm test -w @nim/web
```

(or `npx vitest run` inside each workspace directory).

## Deployment

### Web: Vercel

Project settings in Vercel:

- Framework Preset: **Vite**
- Root Directory: `web`, with **Include source files outside of the Root Directory in the Build Step** turned ON (the web app depends on the `shared` workspace)
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`
- Environment variable: `VITE_SERVER_URL=wss://your-server.example.com` (baked in at build time, so redeploy after changing it)

### Server: Render / Fly.io / Railway

The server **cannot run on Vercel**: it needs long-lived, persistent WebSocket connections and in-memory room state, which Vercel's serverless functions do not provide. Deploy it to a host that runs a normal long-lived process or container.

`server/Dockerfile` is provided; build from the repo root:

```sh
docker build -f server/Dockerfile -t nim-server .
docker run -p 8080:8080 nim-server
```

On Render/Fly/Railway, point the service at that Dockerfile (context = repo root). The host's `PORT` env var is respected (default 8080). Use the resulting public `wss://` URL as `VITE_SERVER_URL` for the web app. Run a single instance, since rooms live in memory.
