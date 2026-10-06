import type { GameState, Move, Player } from './types';

export type ClientMsg =
  | { type: 'create' }
  | { type: 'join'; code: string }
  | { type: 'reconnect'; code: string; token: string }
  | { type: 'move'; move: Move };

export type ServerMsg =
  | { type: 'joined'; code: string; token: string; seat: Player }
  | { type: 'state'; state: GameState }
  | { type: 'opponent'; connected: boolean }
  | { type: 'error'; message: string };
