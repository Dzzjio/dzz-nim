import { describe, it, expect } from 'vitest';
import { initialState, isLegalMove, applyMove } from '../src/index';

describe('rules', () => {
  it('initialState sets piles and turn', () => {
    const s = initialState(1);
    expect(s).toEqual({ piles: [1, 3, 5, 7], turn: 1, winner: null });
  });
  it('applyMove removes matches and flips turn', () => {
    const s = applyMove(initialState(0), { pile: 3, count: 2 });
    expect(s.piles).toEqual([1, 3, 5, 5]);
    expect(s.turn).toBe(1);
    expect(s.winner).toBeNull();
  });
  it('taking the last match loses', () => {
    const s = applyMove({ piles: [0, 0, 0, 1], turn: 0, winner: null }, { pile: 3, count: 1 });
    expect(s.winner).toBe(1);
  });
  it('rejects illegal moves', () => {
    const st = { piles: [1, 3, 5, 7], turn: 0 as const, winner: null };
    for (const m of [
      { pile: 1, count: 0 }, { pile: 1, count: -1 }, { pile: 1, count: 1.5 },
      { pile: 1, count: 4 }, { pile: -1, count: 1 }, { pile: 4, count: 1 },
    ]) {
      expect(isLegalMove(st, m)).toBe(false);
      expect(() => applyMove(st, m)).toThrow('illegal move');
    }
  });
  it('rejects moves after game over', () => {
    const st = { piles: [0, 0, 0, 0], turn: 0 as const, winner: 1 as const };
    expect(isLegalMove(st, { pile: 0, count: 1 })).toBe(false);
    const st2 = { piles: [1, 3, 5, 7], turn: 0 as const, winner: 1 as const };
    expect(isLegalMove(st2, { pile: 1, count: 1 })).toBe(false);
  });
  it('does not mutate input', () => {
    const st = initialState(0);
    applyMove(st, { pile: 0, count: 1 });
    expect(st).toEqual({ piles: [1, 3, 5, 7], turn: 0, winner: null });
  });
});
