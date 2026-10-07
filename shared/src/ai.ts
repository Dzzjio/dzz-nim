import type { GameState, Move } from './types';

/** Misère Nim: true if the player to move loses against perfect play. */
function isLosing(piles: number[]): boolean {
  if (piles.some((p) => p >= 2)) return piles.reduce((a, p) => a ^ p, 0) === 0;
  return piles.filter((p) => p === 1).length % 2 === 1; // only 1-piles left: odd count loses
}

/**
 * Perfect misère Nim move (nim-sum strategy), picked at random among the equally good ones
 * so games don't repeat. From a losing position it plays a random move that doesn't take
 * the last match. Throws if no match remains.
 */
export function aiMove(state: GameState, rng: () => number = Math.random): Move {
  const winning: Move[] = [];
  const safe: Move[] = [];
  const all: Move[] = [];
  state.piles.forEach((n, pile) => {
    for (let count = 1; count <= n; count++) {
      const move = { pile, count };
      all.push(move);
      const next = state.piles.slice();
      next[pile] -= count;
      if (next.every((p) => p === 0)) continue; // taking the last match loses
      safe.push(move);
      if (isLosing(next)) winning.push(move);
    }
  });
  const pool = winning.length ? winning : safe.length ? safe : all;
  if (!pool.length) throw new Error('no legal move');
  return pool[Math.floor(rng() * pool.length)];
}
