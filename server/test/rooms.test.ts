import { describe, it, expect } from 'vitest';
import { RoomManager } from '../src/rooms';

function setup(random = () => 0) {
  let t = 1000;
  const m = new RoomManager({ now: () => t, random, reconnectMs: 30000, idleMs: 600000 });
  return { m, advance: (ms: number) => (t += ms) };
}
function started() {
  const s = setup();
  const c = s.m.createRoom('a') as any;
  const j = s.m.joinRoom(c.code, 'b') as any;
  return { ...s, code: c.code, c, j };
}

describe('RoomManager', () => {
  it('create + join starts the game', () => {
    const { c, j } = started();
    expect(c.seat).toBe(0);
    expect(j.seat).toBe(1);
    expect(j.state.piles).toEqual([1, 3, 5, 7]);
    expect(j.state.turn).toBe(0);
    expect(c.token).not.toBe(j.token);
  });
  it('first player chosen by random', () => {
    const s = setup(() => 0.9);
    const c = s.m.createRoom('a') as any;
    const j = s.m.joinRoom(c.code, 'b') as any;
    expect(j.state.turn).toBe(1);
  });
  it('codes are 4 chars from allowed alphabet', () => {
    const { m } = setup(Math.random);
    for (let i = 0; i < 50; i++) expect((m.createRoom('c' + i) as any).code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
  });
  it('lowercase code joins', () => {
    const { m } = setup();
    const c = m.createRoom('a') as any;
    expect('error' in m.joinRoom(c.code.toLowerCase(), 'b')).toBe(false);
  });
  it('join nonexistent errors', () => {
    expect('error' in setup().m.joinRoom('ZZZZ', 'b')).toBe(true);
  });
  it('third join errors room full', () => {
    const { m, code } = started();
    expect(m.joinRoom(code, 'c')).toEqual({ error: 'room full' });
  });
  it('out-of-turn move rejected, state unchanged', () => {
    const { m } = started();
    expect('error' in m.move('b', { pile: 0, count: 1 })).toBe(true);
    const r = m.move('a', { pile: 3, count: 2 }) as any;
    expect(r.state.piles).toEqual([1, 3, 5, 5]);
    expect(r.to.sort()).toEqual(['a', 'b']);
  });
  it('illegal moves rejected', () => {
    const { m } = started();
    for (const mv of [{ pile: 0, count: 0 }, { pile: 0, count: 2 }, { pile: 9, count: 1 }, { pile: 0, count: -1 }, { pile: 0, count: 0.5 }])
      expect('error' in m.move('a', mv)).toBe(true);
    const r = m.move('a', { pile: 0, count: 1 }) as any;
    expect(r.state.piles).toEqual([0, 3, 5, 7]);
  });
  it('unknown connection and game not started rejected', () => {
    const { m } = setup();
    expect('error' in m.move('x', { pile: 0, count: 1 })).toBe(true);
    m.createRoom('a');
    expect('error' in m.move('a', { pile: 0, count: 1 })).toBe(true);
  });
  it('move after game over rejected', () => {
    const { m } = started();
    const seq: [string, number, number][] = [['a', 0, 1], ['b', 1, 3], ['a', 2, 5], ['b', 3, 6]];
    for (const [c, p, n] of seq) expect('error' in m.move(c, { pile: p, count: n })).toBe(false);
    // piles [0,0,0,1], turn a: a must take last -> a loses
    const r = m.move('a', { pile: 3, count: 1 }) as any;
    expect(r.state.winner).toBe(1);
    expect('error' in m.move('b', { pile: 0, count: 1 })).toBe(true);
  });
  it('reconnect wrong token errors', () => {
    const { m, code } = started();
    m.disconnect('a');
    expect('error' in m.reconnect(code, 'bad', 'a2')).toBe(true);
  });
  it('reconnect with right token restores seat', () => {
    const { m, code, c, advance } = started();
    expect(m.disconnect('a')).toEqual({ opponentConnId: 'b' });
    advance(10000);
    m.sweep();
    const r = m.reconnect(code, c.token, 'a2') as any;
    expect(r.seat).toBe(0);
    expect(r.state.piles).toEqual([1, 3, 5, 7]);
    expect(m.connIds(code).sort()).toEqual(['a2', 'b']);
    expect('error' in m.move('a2', { pile: 0, count: 1 })).toBe(false);
  });
  it('room removed after reconnectMs + sweep', () => {
    const { m, code, c, advance } = started();
    m.disconnect('a');
    advance(30001);
    m.sweep();
    expect(m.connIds(code)).toEqual([]);
    expect('error' in m.reconnect(code, c.token, 'a2')).toBe(true);
    expect('error' in m.joinRoom(code, 'z')).toBe(true);
  });
  it('idle rooms expire', () => {
    const { m, code, advance } = started();
    advance(600001);
    m.sweep();
    expect('error' in m.joinRoom(code, 'z')).toBe(true);
  });
  it('create twice with same conn errors', () => {
    const { m } = setup();
    m.createRoom('a');
    expect(m.createRoom('a')).toEqual({ error: 'already in a room' });
  });
  it('create then join own code errors', () => {
    const { m } = setup();
    const c = m.createRoom('a') as any;
    expect(m.joinRoom(c.code, 'a')).toEqual({ error: 'already in a room' });
    expect(m.connIds(c.code)).toEqual(['a']);
  });
  it('join then create errors', () => {
    const { m, code } = started();
    expect(m.createRoom('b')).toEqual({ error: 'already in a room' });
    expect(m.connIds(code).sort()).toEqual(['a', 'b']);
  });
  it('reconnect with registered conn errors', () => {
    const { m, code, c } = started();
    expect(m.reconnect(code, c.token, 'b')).toEqual({ error: 'already in a room' });
  });
  it('move from disconnected conn errors', () => {
    const { m } = started();
    m.disconnect('a');
    expect(m.move('a', { pile: 0, count: 1 })).toEqual({ error: 'not in a room' });
  });
  it('sweep returns still-connected connIds of dropped rooms', () => {
    const { m, advance } = started();
    m.disconnect('a');
    advance(30001);
    expect(m.sweep()).toEqual(['b']);
    expect(m.sweep()).toEqual([]);
  });
  it('reconnect takeover reports the replaced connId', () => {
    const { m, code, c } = started();
    const r = m.reconnect(code, c.token, 'a2') as any;
    expect(r.replaced).toBe('a');
  });
});
