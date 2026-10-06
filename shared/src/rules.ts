import type { GameState, Move, Player } from './types';

export function initialState(first: Player): GameState {
  return { piles: [1, 3, 5, 7], turn: first, winner: null };
}

export function isLegalMove(state: GameState, move: Move): boolean {
  if (state.winner !== null) return false;
  if (!move || !Number.isInteger(move.pile) || !Number.isInteger(move.count)) return false;
  if (move.pile < 0 || move.pile >= state.piles.length) return false;
  return move.count >= 1 && move.count <= state.piles[move.pile];
}

export function applyMove(state: GameState, move: Move): GameState {
  if (!isLegalMove(state, move)) throw new Error('illegal move');
  const piles = state.piles.slice();
  piles[move.pile] -= move.count;
  const other: Player = state.turn === 0 ? 1 : 0;
  const empty = piles.every((p) => p === 0);
  return { piles, turn: other, winner: empty ? other : null };
}
