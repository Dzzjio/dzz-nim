import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { aiMove } from '@nim/shared';
import { useLocalGame } from './useLocalGame';

vi.mock('@nim/shared', async (orig) => {
  const actual = await orig<typeof import('@nim/shared')>();
  return { ...actual, aiMove: vi.fn(actual.aiMove) };
});

const total = (p: number[]) => p.reduce((a, b) => a + b, 0);

describe('useLocalGame', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(aiMove).mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('AI first: moves after 600ms, play before that is ignored', () => {
    const { result } = renderHook(() => useLocalGame('ai'));
    expect(result.current.myTurn).toBe(false);
    expect(result.current.status).toBe('playing');
    act(() => result.current.play({ pile: 3, count: 1 }));
    expect(total(result.current.state.piles)).toBe(16);
    act(() => { vi.advanceTimersByTime(599); });
    expect(total(result.current.state.piles)).toBe(16);
    act(() => { vi.advanceTimersByTime(1); });
    expect(total(result.current.state.piles)).toBeLessThan(16);
    expect(result.current.myTurn).toBe(true);
  });

  it('player first: play applies, then AI replies', () => {
    const { result } = renderHook(() => useLocalGame('player'));
    expect(result.current.myTurn).toBe(true);
    act(() => result.current.play({ pile: 3, count: 2 }));
    expect(result.current.state.piles).toEqual([1, 3, 5, 5]);
    expect(result.current.myTurn).toBe(false);
    act(() => { vi.advanceTimersByTime(600); });
    expect(total(result.current.state.piles)).toBeLessThan(14);
    expect(result.current.myTurn).toBe(true);
  });

  it('player taking last match loses', () => {
    const { result } = renderHook(() => useLocalGame('player'));
    const play = (m: { pile: number; count: number }) => act(() => result.current.play(m));
    // piles 1,3,5,7: strip everything; AI replies in between, so loop until over.
    for (let i = 0; i < 20 && result.current.status === 'playing'; i++) {
      if (result.current.myTurn) {
        const idx = result.current.state.piles.findIndex((p) => p > 0);
        play({ pile: idx, count: result.current.state.piles[idx] });
      } else {
        act(() => { vi.advanceTimersByTime(600); });
      }
    }
    // Perfect AI moving second in misère from a losing position beats a greedy player.
    expect(result.current.status).toBe('lost');
    expect(result.current.state.winner).toBe(1);
  });

  it('status lost when the player takes the last match', () => {
    vi.mocked(aiMove)
      .mockReturnValueOnce({ pile: 2, count: 5 }) // -> [1,3,0,0]
      .mockReturnValueOnce({ pile: 0, count: 1 }); // -> [0,1,0,0]
    const { result } = renderHook(() => useLocalGame('player'));
    act(() => result.current.play({ pile: 3, count: 7 })); // [1,3,5,0]
    act(() => { vi.advanceTimersByTime(600); });
    expect(result.current.state.piles).toEqual([1, 3, 0, 0]);
    act(() => result.current.play({ pile: 1, count: 2 })); // [1,1,0,0]
    act(() => { vi.advanceTimersByTime(600); });
    expect(result.current.state.piles).toEqual([0, 1, 0, 0]);
    expect(result.current.status).toBe('playing');
    act(() => result.current.play({ pile: 1, count: 1 })); // player takes last
    expect(result.current.state.piles).toEqual([0, 0, 0, 0]);
    expect(result.current.status).toBe('lost');
  });

  it('status won when the AI takes the last match', () => {
    vi.mocked(aiMove)
      .mockReturnValueOnce({ pile: 2, count: 5 }) // -> [1,3,0,0]
      .mockReturnValueOnce({ pile: 0, count: 1 }); // takes the last match
    const { result } = renderHook(() => useLocalGame('player'));
    act(() => result.current.play({ pile: 3, count: 7 })); // [1,3,5,0]
    act(() => { vi.advanceTimersByTime(600); });
    act(() => result.current.play({ pile: 1, count: 3 })); // [1,0,0,0]
    expect(result.current.status).toBe('playing');
    act(() => { vi.advanceTimersByTime(600); });
    expect(result.current.state.piles).toEqual([0, 0, 0, 0]);
    expect(result.current.status).toBe('won');
  });
});
