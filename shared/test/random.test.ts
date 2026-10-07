import { describe, it, expect } from 'vitest';
import { aiMove, applyMove, initialState, isLegalMove, randomPiles } from '../src/index';
import type { GameState } from '../src/index';

/** Deterministic rng from a fixed list of values in [0, 1). */
const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

describe('randomPiles', () => {
  it('deals 4 sorted rows of 1-7 with at least 8 matches', () => {
    for (let n = 0; n < 500; n++) {
      const p = randomPiles();
      expect(p).toHaveLength(4);
      expect(p.every((c) => Number.isInteger(c) && c >= 1 && c <= 7)).toBe(true);
      expect([...p].sort((a, b) => a - b)).toEqual(p);
      expect(p.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(8);
    }
  });

  it('re-deals boards that are too small', () => {
    // first deal 1,1,1,1 (total 4) is rejected; second is 7,7,7,7
    expect(randomPiles(seq(0, 0, 0, 0, 0.99, 0.99, 0.99, 0.99))).toEqual([7, 7, 7, 7]);
  });

  it('actually varies', () => {
    const seen = new Set(Array.from({ length: 50 }, () => randomPiles().join(',')));
    expect(seen.size).toBeGreaterThan(5);
  });

  it('initialState takes a dealt board, defaulting to 1-3-5-7', () => {
    expect(initialState(0).piles).toEqual([1, 3, 5, 7]);
    expect(initialState(1, [2, 2, 4, 6])).toEqual({ piles: [2, 2, 4, 6], turn: 1, winner: null });
  });
});

describe('aiMove randomness', () => {
  const st = (piles: number[]): GameState => ({ piles, turn: 1, winner: null });

  it('picks different winning moves when there are several', () => {
    // [1,3,5,6]: nim-sum 1, several winning replies exist
    const moves = new Set(Array.from({ length: 200 }, () => JSON.stringify(aiMove(st([1, 3, 5, 6])))));
    expect(moves.size).toBeGreaterThan(1);
  });

  it('opens differently from a losing position, without suiciding', () => {
    const moves = new Set(Array.from({ length: 200 }, () => JSON.stringify(aiMove(st([1, 3, 5, 7])))));
    expect(moves.size).toBeGreaterThan(3);
    const s = st([1, 1, 0, 0]);
    for (let n = 0; n < 50; n++) {
      const m = aiMove(s);
      expect(isLegalMove(s, m)).toBe(true);
      expect(applyMove(s, m).winner).toBeNull();
    }
  });

  it('is deterministic with an injected rng', () => {
    const a = aiMove(st([1, 3, 5, 7]), seq(0.42));
    const b = aiMove(st([1, 3, 5, 7]), seq(0.42));
    expect(a).toEqual(b);
  });
});
