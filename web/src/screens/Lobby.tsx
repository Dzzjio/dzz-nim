import Header from '../components/Header';
import { useState } from 'react';
import { buildInviteLink } from '../invite';
import Game from './Game';
import { clearSession, readSession, useOnlineGame } from '../hooks/useOnlineGame';
import type { OnlineIntent } from '../hooks/useOnlineGame';

function InviteButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const invite = async () => {
    const url = buildInviteLink(code);
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Nim', text: 'Play Nim with me!', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* share dismissed or clipboard blocked; the room code is still shown */ }
  };
  return <button onClick={invite}>{copied ? 'Link copied' : 'Invite a friend'}</button>;
}

function Session({ intent, onHome }: { intent: OnlineIntent; onHome(): void }) {
  const game = useOnlineGame(intent);
  const leave = () => {
    clearSession();
    onHome();
  };
  if (game.status !== 'waiting')
    return <Game game={game} online opponentConnected={game.opponentConnected} onHome={leave} />;
  if (game.code === null)
    return (
      <div className="screen">
      <div className="panel">
      <Header compact />
        {game.error ? <p className="error">{game.error}</p> : <p>Connecting…</p>}
        <button className="quiet" onClick={leave}>← Back</button>
      </div>
      </div>
    );
  return (
      <div className="screen">
      <div className="panel">
      <Header compact />
        <p className="label">Room code</p>
        <p className="code" aria-label="room code">{game.code}</p>
        <p>Send this code, or an invite link, to your opponent.</p>
        <InviteButton code={game.code} />
        <p className="status wait">Waiting for opponent…</p>
        {game.error && <p className="error">{game.error}</p>}
        <button className="quiet" onClick={leave}>Cancel</button>
      </div>
      </div>
    );
}

export default function Lobby({ invite = null, onHome }: { invite?: string | null; onHome(): void }) {
  const [intent, setIntent] = useState<OnlineIntent | null>(() => {
    const sess = readSession();
    // A stored session for this room means we are resuming after a refresh; the hook reconnects.
    if (sess && (!invite || sess.code === invite)) return { kind: 'create' };
    if (invite) {
      clearSession(); // the invite supersedes a session for some other room
      return { kind: 'join', code: invite };
    }
    return null;
  });
  const [code, setCode] = useState('');
  if (intent) return <Session intent={intent} onHome={onHome} />;
  return (
    <div className="screen">
      <div className="panel">
      <Header compact />
      <h2>Play online</h2>
      <nav className="menu">
        <button className="menu-item" onClick={() => setIntent({ kind: 'create' })}>
          <span>Create a room</span>
          <span aria-hidden="true">→</span>
        </button>
      </nav>
      <p className="label">or join with a code</p>
      <div className="join">
        <input
          aria-label="Room code"
          placeholder="Room code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <button disabled={!code.trim()} onClick={() => setIntent({ kind: 'join', code: code.trim() })}>
          Join room
        </button>
      </div>
      <button className="quiet" onClick={onHome}>← Back</button>
      </div>
    </div>
  );
}
