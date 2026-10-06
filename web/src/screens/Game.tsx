import Header from '../components/Header';
import Board from '../components/Board';
import type { GameApi } from '../types';

export default function Game({
  game,
  onAgain,
  onHome,
  online = false,
  opponentConnected = true,
}: {
  game: GameApi;
  onAgain?(): void;
  onHome(): void;
  online?: boolean;
  opponentConnected?: boolean;
}) {
  const text =
    game.status === 'won'
      ? 'You win'
      : game.status === 'lost'
        ? 'You lose'
        : game.status === 'waiting'
          ? 'Waiting…'
          : game.myTurn
            ? 'Your turn'
            : online
              ? "Opponent's turn"
              : 'AI thinking…';
  const tone =
    game.status === 'won' ? 'win' : game.status === 'lost' ? 'lose' : game.myTurn ? 'turn' : 'wait';
  const over = game.status === 'won' || game.status === 'lost';
  return (
    <div className="screen">
      <div className="panel">
      <Header compact />
      <p className={`status ${tone}`} role="status">{text}</p>
      {online && !opponentConnected && <p className="error">Opponent disconnected — waiting…</p>}
      {game.error && <p className="error">{game.error}</p>}
      <Board piles={game.state.piles} disabled={!game.myTurn} onMove={game.play} />
      {(over || online) && (
        <div>
          {over && onAgain && <button onClick={onAgain}>Play again</button>}
          <button onClick={onHome}>Home</button>
        </div>
      )}
      </div>
    </div>
  );
}
