import { useCallback, useEffect, useRef, useState } from 'react';
import { initialState } from '@nim/shared';
import type { ClientMsg, GameState, Move, Player, ServerMsg } from '@nim/shared';
import type { GameApi } from '../types';

export const SESSION_KEY = 'nim-session';
export const RECONNECT_MS = 2000;

export type OnlineIntent = { kind: 'create' } | { kind: 'join'; code: string };
type Session = { code: string; token: string };
type WSCtor = typeof WebSocket;

export function readSession(): Session | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
    return v && typeof v.code === 'string' && typeof v.token === 'string' ? v : null;
  } catch {
    return null;
  }
}
function writeSession(s: Session) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
export function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

function parse(data: unknown): ServerMsg | null {
  try {
    const m = JSON.parse(String(data));
    if (typeof m !== 'object' || m === null) return null;
    switch (m.type) {
      case 'joined':
        return typeof m.code === 'string' && typeof m.token === 'string' && (m.seat === 0 || m.seat === 1) ? m : null;
      case 'state': {
        const s = m.state;
        return s && Array.isArray(s.piles) && s.piles.every((n: unknown) => Number.isInteger(n)) &&
          (s.turn === 0 || s.turn === 1) && (s.winner === null || s.winner === 0 || s.winner === 1)
          ? m
          : null;
      }
      case 'opponent':
        return typeof m.connected === 'boolean' ? m : null;
      case 'error':
        return typeof m.message === 'string' ? m : null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function useOnlineGame(
  intent: OnlineIntent,
  WS: WSCtor = WebSocket,
): GameApi & { code: string | null; opponentConnected: boolean } {
  const [state, setState] = useState<GameState | null>(null);
  const [mySeat, setMySeat] = useState<Player>(0);
  const [code, setCode] = useState<string | null>(() => readSession()?.code ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isDead, setDead] = useState(false);
  const [opponentConnected, setOpponentConnected] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const intentRef = useRef(intent);
  intentRef.current = intent;
  const pending = useRef(false); // a move is in flight; ignore repeats until the next state
  const isDeadRef = useRef(false);
  isDeadRef.current = isDead;
  const latest = useRef({ state, mySeat });
  latest.current = { state, mySeat };

  useEffect(() => {
    let disposed = false;
    let dead = false; // stop retrying (failed reconnect)
    let timer: ReturnType<typeof setTimeout> | undefined;
    let awaitingReconnect = false;
    const url = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? 'ws://localhost:8080';

    const connect = () => {
      timer = undefined;
      let ws: WebSocket;
      try {
        ws = new WS(url);
      } catch {
        dead = true;
        setDead(true);
        setError('Could not connect to the server');
        return;
      }
      wsRef.current = ws;
      const send = (m: ClientMsg) => ws.send(JSON.stringify(m));

      ws.onopen = () => {
        if (disposed) return;
        const sess = readSession();
        if (sess) {
          awaitingReconnect = true;
          send({ type: 'reconnect', code: sess.code, token: sess.token });
        } else {
          const i = intentRef.current;
          send(i.kind === 'create' ? { type: 'create' } : { type: 'join', code: i.code.toUpperCase() });
        }
      };
      ws.onmessage = (e) => {
        if (disposed) return;
        let m = parse(e.data);
        if (!m) return;
        switch (m.type) {
          case 'joined':
            awaitingReconnect = false;
            writeSession({ code: m.code, token: m.token });
            setCode(m.code);
            setMySeat(m.seat);
            setError(null);
            break;
          case 'state':
            pending.current = false;
            setState(m.state);
            setError(null);
            break;
          case 'opponent':
            setOpponentConnected(m.connected);
            break;
          case 'error':
            if (m.message === 'session taken over' || m.message === 'room expired') {
              // Terminal: stop for good (another tab took the seat / the room is gone).
              // The last known state is kept so the board stays visible.
              dead = true;
              setDead(true);
              if (m.message === 'room expired') m = { type: 'error', message: 'Opponent left — game ended' };
              if (timer !== undefined) clearTimeout(timer);
              clearSession();
              setCode(null);
              ws.close();
            } else if (awaitingReconnect) {
              awaitingReconnect = false;
              dead = true;
              clearSession();
              setCode(null);
              ws.close();
            }
            pending.current = false;
            setError(m.message);
            break;
        }
      };
      ws.onclose = () => {
        if (disposed || dead || wsRef.current !== ws) return;
        timer = setTimeout(connect, RECONNECT_MS);
      };
      ws.onerror = () => { /* close follows; retry handled there */ };
    };

    connect();
    return () => {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
        ws.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [WS]);

  const effective = state ?? initialState(0);
  const myTurn = !isDead && state !== null && state.winner === null && state.turn === mySeat;

  const play = useCallback((move: Move) => {
    const { state: s, mySeat: seat } = latest.current;
    const ws = wsRef.current;
    if (isDeadRef.current || !s || s.winner !== null || s.turn !== seat || !ws || ws.readyState !== 1 || pending.current) return;
    pending.current = true;
    ws.send(JSON.stringify({ type: 'move', move } satisfies ClientMsg));
  }, []);

  const status: GameApi['status'] =
    state === null ? 'waiting' : state.winner === null ? 'playing' : state.winner === mySeat ? 'won' : 'lost';

  return { state: effective, mySeat, myTurn, play, status, error, code, opponentConnected };
}
