import type { GameState, Move, Player } from './types';

export const CLASSIC_PILES = [1, 3, 5, 7];

export function initialState(first: Player, piles: number[] = CLASSIC_PILES): GameState {
  return { piles: piles.slice(), turn: first, winner: null };
}

/** A random board: 4 rows of 1-7 matches, smallest first, never fewer than 8 matches in all. */
export function randomPiles(rng: () => number = Math.random): number[] {
  for (;;) {
    const piles = Array.from({ length: 4 }, () => 1 + Math.floor(rng() * 7)).sort((a, b) => a - b);
    if (piles.reduce((a, b) => a + b, 0) >= 8) return piles;
  }
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
