export type Player = 0 | 1;
export type Move = { pile: number; count: number };
export type GameState = { piles: number[]; turn: Player; winner: Player | null };
