import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '@nim/shared';
import { RoomManager } from './rooms';

function isMove(m: unknown): m is { pile: number; count: number } {
  return (
    typeof m === 'object' &&
    m !== null &&
    Number.isInteger((m as any).pile) &&
    Number.isInteger((m as any).count)
  );
}

export interface ServerOpts {
  heartbeatMs?: number;
  sweepMs?: number;
  reconnectMs?: number;
  idleMs?: number;
  unjoinedMs?: number;
}

export function startServer(port: number, opts: ServerOpts = {}): { close(): Promise<void>; port: number } {
  const manager = new RoomManager({ reconnectMs: opts.reconnectMs, idleMs: opts.idleMs });
  const wss = new WebSocketServer({ port, maxPayload: 4096 });
  wss.on('error', (e) => console.error('wss error', e));
  const alive = new WeakMap<WebSocket, boolean>();
  const joined = new Set<string>();
  const sockets = new Map<string, WebSocket>();

  const send = (connId: string | null, msg: ServerMsg) => {
    const ws = connId ? sockets.get(connId) : undefined;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  const err = (connId: string, message: string) => send(connId, { type: 'error', message });

  wss.on('connection', (ws) => {
    const connId = randomUUID();
    sockets.set(connId, ws);
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    // Malformed frames (bad UTF-8, oversize, unmasked) must never crash the process.
    ws.on('error', () => ws.terminate());
    const unjoinedTimer = setTimeout(() => {
      if (!joined.has(connId)) ws.terminate();
    }, opts.unjoinedMs ?? 60000);
    ws.on('close', () => clearTimeout(unjoinedTimer));

    ws.on('message', (data) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return err(connId, 'invalid JSON');
      }
      if (typeof msg !== 'object' || msg === null || typeof (msg as any).type !== 'string') {
        return err(connId, 'invalid message');
      }
      try {
      switch (msg.type) {
        case 'create': {
          const r = manager.createRoom(connId);
          if ('error' in r) return err(connId, r.error);
          joined.add(connId);
          send(connId, { type: 'joined', code: r.code, token: r.token, seat: r.seat });
          return;
        }
        case 'join': {
          if (typeof msg.code !== 'string') return err(connId, 'invalid code');
          const r = manager.joinRoom(msg.code, connId);
          if ('error' in r) return err(connId, r.error);
          joined.add(connId);
          send(connId, { type: 'joined', code: msg.code.toUpperCase(), token: r.token, seat: r.seat });
          // Both players learn the state once the second seat is filled.
          for (const id of manager.connIds(msg.code)) send(id, { type: 'state', state: r.state });
          send(connId, { type: 'opponent', connected: manager.connIds(msg.code).some((id) => id !== connId) });
          return;
        }
        case 'reconnect': {
          if (typeof msg.code !== 'string' || typeof msg.token !== 'string') return err(connId, 'invalid reconnect');
          const r = manager.reconnect(msg.code, msg.token, connId);
          if ('error' in r) return err(connId, r.error);
          if (r.replaced) {
            const old = sockets.get(r.replaced);
            sockets.delete(r.replaced);
            if (old && old.readyState === WebSocket.OPEN) {
              old.send(JSON.stringify({ type: 'error', message: 'session taken over' } satisfies ServerMsg));
            }
            old?.close();
          }
          const code = msg.code.toUpperCase();
          joined.add(connId);
          send(connId, { type: 'joined', code, token: msg.token, seat: r.seat });
          if (r.state) {
            send(connId, { type: 'state', state: r.state });
            // Presence of the other seat (only meaningful once both seats are filled).
            const present = manager.connIds(code).some((id) => id !== connId);
            send(connId, { type: 'opponent', connected: present });
          }
          for (const id of manager.connIds(code)) if (id !== connId) send(id, { type: 'opponent', connected: true });
          return;
        }
        case 'move': {
          if (!isMove(msg.move)) return err(connId, 'invalid move');
          const r = manager.move(connId, { pile: msg.move.pile, count: msg.move.count });
          if ('error' in r) return err(connId, r.error);
          for (const id of r.to) send(id, { type: 'state', state: r.state });
          return;
        }
        default:
          return err(connId, 'unknown message type');
      }
      } catch (e) {
        console.error('handler error', e);
        err(connId, 'internal error');
      }
    });

    ws.on('close', () => {
      // A taken-over socket was already removed from the map; the manager ignores it.
      if (sockets.get(connId) !== ws) return;
      sockets.delete(connId);
      joined.delete(connId);
      const { opponentConnId } = manager.disconnect(connId);
      send(opponentConnId, { type: 'opponent', connected: false });
    });
  });

  const timer = setInterval(() => {
    for (const id of manager.sweep()) {
      send(id, { type: 'error', message: 'room expired' });
      sockets.get(id)?.close();
    }
  }, opts.sweepMs ?? 5000);

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      try { ws.ping(); } catch { ws.terminate(); }
    }
  }, opts.heartbeatMs ?? 25000);

  const address = wss.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;

  return {
    port: actualPort,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(timer);
        clearInterval(heartbeat);
        for (const ws of wss.clients) ws.terminate();
        wss.close(() => resolve());
      }),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT ?? 8080);
  const s = startServer(port);
  console.log(`nim server listening on ${s.port}`);
}
