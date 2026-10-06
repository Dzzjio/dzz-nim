import { describe, it, expect } from 'vitest';
import { aiMove, applyMove, isLegalMove } from '../src/index';
import type { GameState, Player } from '../src/index';

// Test oracle only: true if the player to move wins (misère: taking the last match loses).
const memo = new Map<string, boolean>();
function bruteWinning(piles: number[]): boolean {
  const key = piles.join(',');
  const cached = memo.get(key);
  if (cached !== undefined) return cached;
  let result = false;
  for (let i = 0; i < piles.length && !result; i++) {
    for (let c = 1; c <= piles[i]; c++) {
      const next = piles.slice();
      next[i] -= c;
      if (next.every((p) => p === 0)) continue; // emptying the board loses
      if (!bruteWinning(next)) {
        result = true;
        break;
      }
    }
  }
  memo.set(key, result);
  return result;
}

const st = (piles: number[], turn: Player = 0): GameState => ({ piles, turn, winner: null });

describe('bruteWinning oracle', () => {
  it('1-3-5-7 is lost, 1-3-5-6 is won', () => {
    expect(bruteWinning([1, 3, 5, 7])).toBe(false);
    expect(bruteWinning([1, 3, 5, 6])).toBe(true);
  });
  it('misère edge cases', () => {
    expect(bruteWinning([1, 0, 0, 0])).toBe(false);
    expect(bruteWinning([2, 0, 0, 0])).toBe(true);
  });
});

describe('aiMove', () => {
  it('wins from every winning position up to [1,3,5,7]', () => {
    let checked = 0;
    for (let a = 0; a <= 1; a++)
      for (let b = 0; b <= 3; b++)
        for (let c = 0; c <= 5; c++)
          for (let d = 0; d <= 7; d++) {
            const piles = [a, b, c, d];
            if (piles.every((p) => p === 0) || !bruteWinning(piles)) continue;
            const s = st(piles);
            const m = aiMove(s);
            expect(isLegalMove(s, m), `legal for ${piles}`).toBe(true);
            const next = applyMove(s, m);
            expect(next.winner, `not losing immediately for ${piles}`).toBeNull();
            expect(bruteWinning(next.piles), `${piles} -> ${next.piles}`).toBe(false);
            checked++;
          }
    expect(checked).toBeGreaterThan(0);
  });

  it('named cases', () => {
    expect(aiMove(st([0, 0, 0, 5]))).toEqual({ pile: 3, count: 4 });
    expect(aiMove(st([1, 0, 0, 5]))).toEqual({ pile: 3, count: 5 });
  });

  it('returns a legal move from a losing position', () => {
    for (const piles of [[1, 3, 5, 7], [1, 0, 0, 0], [1, 1, 1, 0], [2, 2, 0, 0]]) {
      const s = st(piles);
      expect(bruteWinning(piles)).toBe(false);
      expect(isLegalMove(s, aiMove(s))).toBe(true);
    }
  });

  it('never loses as second player vs a random mover (200 games)', () => {
    for (let g = 0; g < 200; g++) {
      let s: GameState = st([1, 3, 5, 7], 0);
      while (s.winner === null) {
        let m;
        if (s.turn === 0) {
          const opts: { pile: number; count: number }[] = [];
          s.piles.forEach((p, pile) => {
            for (let count = 1; count <= p; count++) opts.push({ pile, count });
          });
          m = opts[Math.floor(Math.random() * opts.length)];
        } else {
          m = aiMove(s);
        }
        s = applyMove(s, m);
      }
      expect(s.winner).toBe(1);
    }
  });
});
