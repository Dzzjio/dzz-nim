import type { GameState, Move } from './types';

/** Perfect misère Nim move (nim-sum strategy). Throws if no match remains. */
export function aiMove(state: GameState): Move {
  const piles = state.piles;
  const big = piles.map((p, i) => i).filter((i) => piles[i] >= 2);
  const ones = piles.filter((p) => p === 1).length;

  if (big.length >= 2) {
    const x = piles.reduce((a, p) => a ^ p, 0);
    if (x !== 0) {
      for (let i = 0; i < piles.length; i++) {
        const target = piles[i] ^ x;
        if (target < piles[i]) return { pile: i, count: piles[i] - target };
      }
    }
    // Losing position: take 1 from the largest pile.
    let largest = big[0];
    for (const i of big) if (piles[i] > piles[largest]) largest = i;
    return { pile: largest, count: 1 };
  }

  if (big.length === 1) {
    const i = big[0];
    // Leave an odd number of 1-piles.
    const target = ones % 2 === 0 ? 1 : 0;
    return { pile: i, count: piles[i] - target };
  }

  const i = piles.findIndex((p) => p === 1);
  if (i === -1) throw new Error('no legal move');
  return { pile: i, count: 1 };
}
