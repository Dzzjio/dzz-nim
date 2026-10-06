import { StrictMode, createElement } from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useOnlineGame, SESSION_KEY } from './useOnlineGame';

class FakeWS {
  static instances: FakeWS[] = [];
  static OPEN = 1;
  readyState = 0;
  sent: any[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeWS.instances.push(this);
  }
  send(d: string) { this.sent.push(JSON.parse(d)); }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.();
  }
  open() { this.readyState = 1; this.onopen?.(); }
  recv(m: unknown) { this.onmessage?.({ data: typeof m === 'string' ? m : JSON.stringify(m) }); }
  drop() { this.close(); }
}
const WS = FakeWS as unknown as typeof WebSocket;
const last = () => FakeWS.instances[FakeWS.instances.length - 1];
const st = (turn: 0 | 1, winner: 0 | 1 | null = null, piles = [1, 3, 5, 7]) => ({ type: 'state', state: { piles, turn, winner } });

describe('useOnlineGame', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWS.instances = [];
    sessionStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it('create sends {type:create} once on open', () => {
    renderHook(() => useOnlineGame({ kind: 'create' }, WS));
    act(() => last().open());
    expect(last().sent).toEqual([{ type: 'create' }]);
  });

  it('join sends the uppercased code', () => {
    renderHook(() => useOnlineGame({ kind: 'join', code: 'abcd' }, WS));
    act(() => last().open());
    expect(last().sent).toEqual([{ type: 'join', code: 'ABCD' }]);
  });

  it('joined + state update seat, turn, status, code; stores session', () => {
    const { result } = renderHook(() => useOnlineGame({ kind: 'create' }, WS));
    act(() => last().open());
    expect(result.current.status).toBe('waiting');
    act(() => last().recv({ type: 'joined', code: 'ABCD', token: 't1', seat: 1 }));
    expect(result.current.code).toBe('ABCD');
    expect(result.current.mySeat).toBe(1);
    expect(result.current.status).toBe('waiting');
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)!)).toEqual({ code: 'ABCD', token: 't1' });
    act(() => last().recv(st(0)));
    expect(result.current.status).toBe('playing');
    expect(result.current.myTurn).toBe(false);
    act(() => last().recv(st(1)));
    expect(result.current.myTurn).toBe(true);
    act(() => last().recv(st(0, 1, [0, 0, 0, 0])));
    expect(result.current.status).toBe('won');
    expect(result.current.myTurn).toBe(false);
    act(() => last().recv(st(1, 0, [0, 0, 0, 0])));
    expect(result.current.status).toBe('lost');
  });

  it('play sends move only when myTurn', () => {
    const { result } = renderHook(() => useOnlineGame({ kind: 'create' }, WS));
    act(() => last().open());
    act(() => last().recv({ type: 'joined', code: 'ABCD', token: 't1', seat: 0 }));
    act(() => last().recv(st(1)));
    act(() => result.current.play({ pile: 0, count: 1 }));
    expect(last().sent.filter((m) => m.type === 'move')).toEqual([]);
    act(() => last().recv(st(0)));
    act(() => result.current.play({ pile: 3, count: 2 }));
    expect(last().sent.at(-1)).toEqual({ type: 'move', move: { pile: 3, count: 2 } });
  });

  it('error message sets error; malformed messages are ignored', () => {
    const { result } = renderHook(() => useOnlineGame({ kind: 'create' }, WS));
    act(() => last().open());
    act(() => last().recv({ type: 'error', message: 'room not found' }));
    expect(result.current.error).toBe('room not found');
    act(() => last().recv('not json{'));
    act(() => last().recv('null'));
    act(() => last().recv({ type: 'state', state: 5 }));
    act(() => last().recv({ type: 'wat' }));
    expect(result.current.error).toBe('room not found');
  });

  it('opponent message toggles opponentConnected', () => {
    const { result } = renderHook(() => useOnlineGame({ kind: 'create' }, WS));
    act(() => last().open());
    expect(result.current.opponentConnected).toBe(true);
    act(() => last().recv({ type: 'opponent', connected: false }));
    expect(result.current.opponentConnected).toBe(false);
    act(() => last().recv({ type: 'opponent', connected: true }));
    expect(result.current.opponentConnected).toBe(true);
  });

  it('after close, retries every 2s and sends reconnect with stored token', () => {
    renderHook(() => useOnlineGame({ kind: 'create' }, WS));
    act(() => last().open());
    act(() => last().recv({ type: 'joined', code: 'ABCD', token: 't1', seat: 0 }));
    act(() => last().drop());
    expect(FakeWS.instances).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(FakeWS.instances).toHaveLength(2);
    act(() => last().drop()); // failed attempt, never opened
    act(() => { vi.advanceTimersByTime(2000); });
    expect(FakeWS.instances).toHaveLength(3);
    act(() => last().open());
    expect(last().sent).toEqual([{ type: 'reconnect', code: 'ABCD', token: 't1' }]);
  });

  it('stored session at mount reconnects instead of creating', () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: 'WXYZ', token: 'tk' }));
    const { result } = renderHook(() => useOnlineGame({ kind: 'create' }, WS));
    expect(result.current.code).toBe('WXYZ');
    act(() => last().open());
    expect(last().sent).toEqual([{ type: 'reconnect', code: 'WXYZ', token: 'tk' }]);
  });

  it('failed reconnect clears the stored session', () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: 'WXYZ', token: 'tk' }));
    const { result } = renderHook(() => useOnlineGame({ kind: 'create' }, WS));
    act(() => last().open());
    act(() => last().recv({ type: 'error', message: 'room not found' }));
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(result.current.error).toBe('room not found');
  });

  it('reconnect then opponent:false shows opponentConnected=false', () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: 'WXYZ', token: 'tk' }));
    const { result } = renderHook(() => useOnlineGame({ kind: 'create' }, WS));
    act(() => last().open());
    act(() => last().recv({ type: 'joined', code: 'WXYZ', token: 'tk', seat: 0 }));
    act(() => last().recv(st(0)));
    act(() => last().recv({ type: 'opponent', connected: false }));
    expect(result.current.opponentConnected).toBe(false);
  });

  it('session taken over stops retrying, clears session, exposes error', () => {
    const { result } = renderHook(() => useOnlineGame({ kind: 'create' }, WS));
    act(() => last().open());
    act(() => last().recv({ type: 'joined', code: 'ABCD', token: 't1', seat: 0 }));
    act(() => last().recv({ type: 'error', message: 'session taken over' }));
    act(() => last().drop());
    act(() => { vi.advanceTimersByTime(10000); });
    expect(FakeWS.instances).toHaveLength(1);
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(result.current.error).toBe('session taken over');
  });

  it('room expired is terminal: keeps state, stops retry, clears session, no turn', () => {
    const { result } = renderHook(() => useOnlineGame({ kind: 'create' }, WS));
    act(() => last().open());
    act(() => last().recv({ type: 'joined', code: 'ABCD', token: 't1', seat: 0 }));
    act(() => last().recv(st(0, null, [0, 1, 2, 3])));
    act(() => last().recv({ type: 'error', message: 'room expired' }));
    act(() => last().drop());
    act(() => { vi.advanceTimersByTime(10000); });
    expect(FakeWS.instances).toHaveLength(1);
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(result.current.error).toBe('Opponent left — game ended');
    expect(result.current.state.piles).toEqual([0, 1, 2, 3]);
    expect(result.current.myTurn).toBe(false);
    act(() => result.current.play({ pile: 1, count: 1 }));
    expect(last().sent.filter((m) => m.type === 'move')).toEqual([]);
  });

  it('constructor throwing sets an error and does not retry', () => {
    const Bad = class { constructor() { throw new Error('bad url'); } } as unknown as typeof WebSocket;
    const { result } = renderHook(() => useOnlineGame({ kind: 'create' }, Bad));
    expect(result.current.error).toBe('Could not connect to the server');
    act(() => { vi.advanceTimersByTime(10000); });
    expect(result.current.error).toBe('Could not connect to the server');
  });

  it('unmount closes the socket and stops retrying', () => {
    const { unmount } = renderHook(() => useOnlineGame({ kind: 'create' }, WS));
    const s = last();
    unmount();
    expect(s.readyState).toBe(3);
    act(() => { vi.advanceTimersByTime(10000); });
    expect(FakeWS.instances).toHaveLength(1);
    expect(s.sent).toEqual([]);
  });

  it('StrictMode double mount sends exactly one create and leaves one live socket', () => {
    renderHook(() => useOnlineGame({ kind: 'create' }, WS), {
      wrapper: ({ children }) => createElement(StrictMode, null, children),
    });
    for (const s of FakeWS.instances) if (s.readyState !== 3) act(() => s.open());
    act(() => { vi.advanceTimersByTime(10000); });
    const creates = FakeWS.instances.flatMap((s) => s.sent).filter((m) => m.type === 'create');
    expect(creates).toHaveLength(1);
    expect(FakeWS.instances.filter((s) => s.readyState !== 3)).toHaveLength(1);
  });
});
