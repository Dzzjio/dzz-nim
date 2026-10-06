import { useState } from 'react';
import Home from './screens/Home';
import Setup from './screens/Setup';
import Game from './screens/Game';
import Lobby from './screens/Lobby';
import { readSession } from './hooks/useOnlineGame';
import { useLocalGame } from './hooks/useLocalGame';

type Screen = 'home' | 'setup' | 'local' | 'online';

function LocalGame({ first, onAgain, onHome }: { first: 'player' | 'ai'; onAgain(): void; onHome(): void }) {
  const game = useLocalGame(first);
  return <Game game={game} onAgain={onAgain} onHome={onHome} />;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => (readSession() ? 'online' : 'home'));
  const [first, setFirst] = useState<'player' | 'ai'>('player');
  const [round, setRound] = useState(0);

  if (screen === 'setup')
    return (
      <Setup
        onStart={(f) => {
          setFirst(f);
          setRound((r) => r + 1);
          setScreen('local');
        }}
        onBack={() => setScreen('home')}
      />
    );
  if (screen === 'local')
    return (
      <LocalGame
        key={round}
        first={first}
        onAgain={() => setScreen('setup')}
        onHome={() => setScreen('home')}
      />
    );
  if (screen === 'online') return <Lobby onHome={() => setScreen('home')} />;
  return <Home onLocal={() => setScreen('setup')} onOnline={() => setScreen('online')} />;
}
