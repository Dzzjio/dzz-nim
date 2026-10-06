import { useCallback, useEffect, useState } from 'react';
import { aiMove, applyMove, initialState, isLegalMove } from '@nim/shared';
import type { GameState, Move, Player } from '@nim/shared';
import type { GameApi } from '../types';

export const AI_DELAY_MS = 600;
const MY_SEAT: Player = 0;

export function useLocalGame(first: 'player' | 'ai'): GameApi {
  const [state, setState] = useState<GameState>(() => initialState(first === 'player' ? 0 : 1));

  const myTurn = state.winner === null && state.turn === MY_SEAT;

  useEffect(() => {
    if (state.winner !== null || state.turn === MY_SEAT) return;
    const id = setTimeout(() => {
      setState((s) => (s.winner === null && s.turn !== MY_SEAT ? applyMove(s, aiMove(s)) : s));
    }, AI_DELAY_MS);
    return () => clearTimeout(id);
  }, [state]);

  const play = useCallback((move: Move) => {
    setState((s) =>
      s.winner === null && s.turn === MY_SEAT && isLegalMove(s, move) ? applyMove(s, move) : s,
    );
  }, []);

  const status: GameApi['status'] =
    state.winner === null ? 'playing' : state.winner === MY_SEAT ? 'won' : 'lost';

  return { state, mySeat: MY_SEAT, myTurn, play, status, error: null };
}
