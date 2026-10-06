import { applyMove, initialState, isLegalMove } from '@nim/shared';
import type { GameState, Move, Player } from '@nim/shared';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

interface Seat {
  token: string;
  connId: string | null;
  disconnectedAt: number | null;
}
interface Room {
  code: string;
  seats: [Seat, Seat | null];
  state: GameState | null;
  lastActivity: number;
}

export interface RoomManagerOpts {
  now?: () => number;
  reconnectMs?: number;
  idleMs?: number;
  random?: () => number;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private conns = new Map<string, { code: string; seat: Player }>();
  private now: () => number;
  private reconnectMs: number;
  private idleMs: number;
  private random: () => number;

  constructor(opts: RoomManagerOpts = {}) {
    this.now = opts.now ?? Date.now;
    this.reconnectMs = opts.reconnectMs ?? 30000;
    this.idleMs = opts.idleMs ?? 600000;
    this.random = opts.random ?? Math.random;
  }

  private newCode(): string | null {
    for (let attempt = 0; attempt < 1000; attempt++) {
      let code = '';
      for (let i = 0; i < 4; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    return null;
  }

  createRoom(connId: string): { code: string; token: string; seat: Player } | { error: string } {
    if (this.conns.has(connId)) return { error: 'already in a room' };
    const code = this.newCode();
    if (code === null) return { error: 'server full' };
    const token = crypto.randomUUID();
    this.rooms.set(code, {
      code,
      seats: [{ token, connId, disconnectedAt: null }, null],
      state: null,
      lastActivity: this.now(),
    });
    this.conns.set(connId, { code, seat: 0 });
    return { code, token, seat: 0 };
  }

  joinRoom(code: string, connId: string): { token: string; seat: Player; state: GameState } | { error: string } {
    if (this.conns.has(connId)) return { error: 'already in a room' };
    const room = this.rooms.get(String(code).toUpperCase());
    if (!room) return { error: 'room not found' };
    if (room.seats[1]) return { error: 'room full' };
    const token = crypto.randomUUID();
    room.seats[1] = { token, connId, disconnectedAt: null };
    const first: Player = this.random() < 0.5 ? 0 : 1;
    room.state = initialState(first);
    room.lastActivity = this.now();
    this.conns.set(connId, { code: room.code, seat: 1 });
    return { token, seat: 1, state: room.state };
  }

  reconnect(
    code: string,
    token: string,
    connId: string,
  ): { seat: Player; state: GameState | null; replaced: string | null } | { error: string } {
    if (this.conns.has(connId)) return { error: 'already in a room' };
    const room = this.rooms.get(String(code).toUpperCase());
    if (!room) return { error: 'room not found' };
    const idx = room.seats.findIndex((s) => s !== null && s.token === token);
    if (idx < 0) return { error: 'invalid token' };
    const seat = room.seats[idx]!;
    const replaced = seat.connId;
    if (replaced) this.conns.delete(replaced);
    seat.connId = connId;
    seat.disconnectedAt = null;
    room.lastActivity = this.now();
    this.conns.set(connId, { code: room.code, seat: idx as Player });
    return { seat: idx as Player, state: room.state, replaced };
  }

  move(connId: string, move: Move): { state: GameState; to: string[] } | { error: string } {
    const c = this.conns.get(connId);
    if (!c) return { error: 'not in a room' };
    const room = this.rooms.get(c.code);
    if (!room) return { error: 'not in a room' };
    const state = room.state;
    if (!state) return { error: 'game not started' };
    if (state.winner !== null) return { error: 'game over' };
    if (state.turn !== c.seat) return { error: 'not your turn' };
    if (!isLegalMove(state, move)) return { error: 'illegal move' };
    room.state = applyMove(state, move);
    room.lastActivity = this.now();
    return { state: room.state, to: this.connIds(room.code) };
  }

  disconnect(connId: string): { opponentConnId: string | null } {
    const c = this.conns.get(connId);
    if (!c) return { opponentConnId: null };
    this.conns.delete(connId);
    const room = this.rooms.get(c.code);
    if (!room) return { opponentConnId: null };
    const seat = room.seats[c.seat];
    if (seat && seat.connId === connId) {
      seat.connId = null;
      seat.disconnectedAt = this.now();
    }
    const opp = room.seats[c.seat === 0 ? 1 : 0];
    return { opponentConnId: opp?.connId ?? null };
  }

  /** Drops expired rooms; returns connIds of still-connected sockets in dropped rooms. */
  sweep(): string[] {
    const t = this.now();
    const dropped: string[] = [];
    for (const [code, room] of this.rooms) {
      const expired =
        t - room.lastActivity > this.idleMs ||
        room.seats.some((s) => s && s.disconnectedAt !== null && t - s.disconnectedAt > this.reconnectMs);
      if (!expired) continue;
      for (const s of room.seats) {
        if (s?.connId) {
          this.conns.delete(s.connId);
          dropped.push(s.connId);
        }
      }
      this.rooms.delete(code);
    }
    return dropped;
  }

  connIds(code: string): string[] {
    const room = this.rooms.get(String(code).toUpperCase());
    if (!room) return [];
    return room.seats.flatMap((s) => (s && s.connId ? [s.connId] : []));
  }
}
