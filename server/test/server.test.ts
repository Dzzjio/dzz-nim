import { describe, it, expect, afterEach } from 'vitest';
import WebSocket from 'ws';
import { startServer } from '../src/index';
import type { ServerMsg } from '@nim/shared';

type Client = { ws: WebSocket; inbox: ServerMsg[]; next(pred?: (m: ServerMsg) => boolean, ms?: number): Promise<ServerMsg>; send(m: unknown): void };

function connect(port: number): Promise<Client> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    const inbox: ServerMsg[] = [];
    const waiters: Array<() => void> = [];
    ws.on('message', (d) => {
      inbox.push(JSON.parse(d.toString()));
      waiters.slice().forEach((w) => w());
    });
    const client: Client = {
      ws,
      inbox,
      send: (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m)),
      next(pred = () => true, ms = 2000) {
        return new Promise((res, rej) => {
          const check = () => {
            const i = inbox.findIndex(pred);
            if (i >= 0) {
              clearTimeout(timer);
              waiters.splice(waiters.indexOf(check), 1);
              res(inbox.splice(i, 1)[0]);
              return true;
            }
            return false;
          };
          const timer = setTimeout(() => {
            waiters.splice(waiters.indexOf(check), 1);
            rej(new Error('timeout waiting for message; inbox=' + JSON.stringify(inbox)));
          }, ms);
          waiters.push(check);
          check();
        });
      },
    };
    ws.on('open', () => resolve(client));
    ws.on('error', reject);
  });
}
const ofType = (t: string) => (m: ServerMsg) => m.type === t;

let server: ReturnType<typeof startServer>;
const clients: Client[] = [];
async function conn() {
  const c = await connect(server.port);
  clients.push(c);
  return c;
}
async function pair() {
  const a = await conn();
  a.send({ type: 'create' });
  const ja = (await a.next(ofType('joined'))) as any;
  const b = await conn();
  b.send({ type: 'join', code: ja.code });
  const jb = (await b.next(ofType('joined'))) as any;
  const sa = (await a.next(ofType('state'))) as any;
  const sb = (await b.next(ofType('state'))) as any;
  return { a, b, ja, jb, sa, sb };
}

afterEach(async () => {
  clients.splice(0).forEach((c) => c.ws.terminate());
  await server.close();
});

describe('server', () => {
  it('plays a full game', async () => {
    server = startServer(0);
    const { a, b, ja, sa, sb } = await pair();
    expect(sa.state).toEqual(sb.state);
    let state = sa.state;
    const bySeat = [a, b];
    while (state.winner === null) {
      const p = state.piles.findIndex((n: number) => n > 0);
      bySeat[state.turn].send({ type: 'move', move: { pile: p, count: 1 } });
      const ma = (await a.next(ofType('state'))) as any;
      const mb = (await b.next(ofType('state'))) as any;
      expect(ma.state).toEqual(mb.state);
      state = ma.state;
    }
    expect(state.winner).not.toBeNull();
    expect(ja.code).toHaveLength(4);
  });

  it('rejects out-of-turn move without broadcasting', async () => {
    server = startServer(0);
    const { a, b, sa } = await pair();
    const wrong = [a, b][1 - sa.state.turn];
    wrong.send({ type: 'move', move: { pile: 0, count: 1 } });
    await wrong.next(ofType('error'));
    await new Promise((r) => setTimeout(r, 100));
    expect(a.inbox.filter(ofType('state'))).toHaveLength(0);
    expect(b.inbox.filter(ofType('state'))).toHaveLength(0);
  });

  it('replies error to garbage and keeps socket open', async () => {
    server = startServer(0);
    const a = await conn();
    a.send('not json{');
    await a.next(ofType('error'));
    a.send({ type: 'bogus' });
    await a.next(ofType('error'));
    a.send('null');
    await a.next(ofType('error'));
    a.send({ type: 'move', move: { pile: 'x', count: 1 } });
    await a.next(ofType('error'));
    expect(a.ws.readyState).toBe(WebSocket.OPEN);
    a.send({ type: 'create' });
    await a.next(ofType('joined'));
  });

  it('errors on joining a missing room', async () => {
    server = startServer(0);
    const a = await conn();
    a.send({ type: 'join', code: 'ZZZZ' });
    await a.next(ofType('error'));
  });

  it('notifies opponent on disconnect and reconnect', async () => {
    server = startServer(0);
    const { a, b, ja, sa } = await pair();
    a.ws.close();
    expect(await b.next((m) => m.type === 'opponent' && !m.connected)).toEqual({ type: 'opponent', connected: false });
    const a2 = await conn();
    a2.send({ type: 'reconnect', code: ja.code, token: ja.token });
    const j = (await a2.next(ofType('joined'))) as any;
    expect(j.seat).toBe(0);
    const st = (await a2.next(ofType('state'))) as any;
    expect(st.state).toEqual(sa.state);
    expect(await b.next(ofType('opponent'))).toEqual({ type: 'opponent', connected: true });
  });

  it('reconnect with wrong token errors', async () => {
    server = startServer(0);
    const { ja } = await pair();
    const x = await conn();
    x.send({ type: 'reconnect', code: ja.code, token: 'nope' });
    await x.next(ofType('error'));
  });

  it('reconnect takeover closes the old live socket', async () => {
    server = startServer(0);
    const { a, ja } = await pair();
    const closed = new Promise<void>((r) => a.ws.on('close', () => r()));
    const a2 = await conn();
    a2.send({ type: 'reconnect', code: ja.code, token: ja.token });
    await a2.next(ofType('joined'));
    await closed;
    expect(a.inbox.find(ofType('error'))).toEqual({ type: 'error', message: 'session taken over' });
  });

  it('reconnect reports opponent present', async () => {
    server = startServer(0);
    const { a, ja } = await pair();
    const a2 = await conn();
    a2.send({ type: 'reconnect', code: ja.code, token: ja.token });
    await a2.next(ofType('joined'));
    await a2.next(ofType('state'));
    expect(await a2.next(ofType('opponent'))).toEqual({ type: 'opponent', connected: true });
    expect(a.ws).toBeDefined();
  });

  it('reconnect reports opponent away', async () => {
    server = startServer(0);
    const { a, b, ja } = await pair();
    b.ws.close();
    await a.next(ofType('opponent'));
    a.ws.close();
    await new Promise((r) => setTimeout(r, 100));
    const a2 = await conn();
    a2.send({ type: 'reconnect', code: ja.code, token: ja.token });
    await a2.next(ofType('joined'));
    await a2.next(ofType('state'));
    expect(await a2.next(ofType('opponent'))).toEqual({ type: 'opponent', connected: false });
  });

  async function freshCanCreate() {
    const f = await conn();
    f.send({ type: 'create' });
    await f.next(ofType('joined'));
  }

  it('survives invalid UTF-8 and oversized frames', async () => {
    server = startServer(0);
    const bad = await conn();
    bad.ws.on('error', () => {});
    bad.ws.send(Buffer.from([0xff, 0xfe, 0xfd]), { binary: false });
    await new Promise((r) => setTimeout(r, 100));
    const big = await conn();
    big.ws.on('error', () => {});
    big.ws.send('x'.repeat(10000));
    await new Promise((r) => setTimeout(r, 100));
    await freshCanCreate();
  });

  it('heartbeat terminates a client that never pongs and notifies opponent', async () => {
    server = startServer(0, { heartbeatMs: 100 });
    const a = await conn();
    a.send({ type: 'create' });
    const ja = (await a.next(ofType('joined'))) as any;
    const b = new WebSocket(`ws://localhost:${server.port}`, { autoPong: false } as any);
    (b as any).pong = () => {};
    const inbox: ServerMsg[] = [];
    b.on('message', (d) => inbox.push(JSON.parse(d.toString())));
    await new Promise((r) => b.on('open', r));
    clients.push({ ws: b } as any);
    b.send(JSON.stringify({ type: 'join', code: ja.code }));
    await a.next(ofType('state'));
    const closed = new Promise<void>((r) => b.on('close', () => r()));
    await closed;
    expect(await a.next((m) => m.type === 'opponent' && !m.connected, 2000)).toEqual({ type: 'opponent', connected: false });
  });

  it('sweep sends room expired to the remaining player', async () => {
    server = startServer(0, { sweepMs: 20, reconnectMs: 50 });
    const { a, b } = await pair();
    b.ws.close();
    const e = await a.next(ofType('error'), 2000);
    expect(e).toEqual({ type: 'error', message: 'room expired' });
  });

  it('join on a full room errors; lowercase code joins; joiner learns opponent presence', async () => {
    server = startServer(0);
    const a = await conn();
    a.send({ type: 'create' });
    const ja = (await a.next(ofType('joined'))) as any;
    const b = await conn();
    b.send({ type: 'join', code: ja.code.toLowerCase() });
    const jb = (await b.next(ofType('joined'))) as any;
    expect(jb.code).toBe(ja.code);
    expect(await b.next(ofType('opponent'))).toEqual({ type: 'opponent', connected: true });
    const c = await conn();
    c.send({ type: 'join', code: ja.code });
    expect(await c.next(ofType('error'))).toEqual({ type: 'error', message: 'room full' });
  });

  it('closes sockets that never join a room', async () => {
    server = startServer(0, { unjoinedMs: 100 });
    const x = await conn();
    await new Promise<void>((r) => x.ws.on('close', () => r()));
  });
});
