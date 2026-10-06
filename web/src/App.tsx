import { useState } from 'react';
import Home from './screens/Home';
import Setup from './screens/Setup';
import Game from './screens/Game';
import Lobby from './screens/Lobby';
import { readSession } from './hooks/useOnlineGame';
import { useLocalGame } from './hooks/useLocalGame';
import { parseInviteCode, stripInviteFromUrl } from './invite';

type Screen = 'home' | 'setup' | 'local' | 'online';

function LocalGame({ first, onAgain, onHome }: { first: 'player' | 'ai'; onAgain(): void; onHome(): void }) {
  const game = useLocalGame(first);
  return <Game game={game} onAgain={onAgain} onHome={onHome} />;
}

export default function App() {
  // Room code from an invite link (?room=CODE); opening one drops the guest straight into that room.
  const [invite, setInvite] = useState(() => parseInviteCode(window.location.search));
  const [screen, setScreen] = useState<Screen>(() => (invite || readSession() ? 'online' : 'home'));
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
  if (screen === 'online')
    return (
      <Lobby
        invite={invite}
        onHome={() => {
          setInvite(null);
          stripInviteFromUrl();
          setScreen('home');
        }}
      />
    );
  return <Home onLocal={() => setScreen('setup')} onOnline={() => setScreen('online')} />;
}
