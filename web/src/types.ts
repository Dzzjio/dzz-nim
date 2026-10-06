import type { GameState, Move, Player } from '@nim/shared';

/** Common result of the local and (Task 6) online game hooks. */
export interface GameApi {
  state: GameState;
  mySeat: Player;
  myTurn: boolean;
  play(move: Move): void;
  status: 'playing' | 'won' | 'lost' | 'waiting';
  error: string | null;
}
