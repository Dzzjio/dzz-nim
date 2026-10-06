import Header from '../components/Header';
export default function Setup({
  onStart,
  onBack,
}: {
  onStart(first: 'player' | 'ai'): void;
  onBack(): void;
}) {
  return (
    <div className="screen">
      <div className="panel">
      <Header compact />
      <h2>Who goes first?</h2>
      <p className="lead">Heads up: the machine never misses when it moves second.</p>
      <nav className="menu">
        <button className="menu-item" onClick={() => onStart('player')}>
          <span>I go first</span>
          <span aria-hidden="true">→</span>
        </button>
        <button className="menu-item" onClick={() => onStart('ai')}>
          <span>Machine goes first</span>
          <span aria-hidden="true">→</span>
        </button>
      </nav>
      <button className="quiet" onClick={onBack}>← Back</button>
      </div>
    </div>
  );
}
