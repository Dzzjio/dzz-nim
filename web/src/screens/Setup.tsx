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
      <button onClick={() => onStart('player')}>I go first</button>
      <button onClick={() => onStart('ai')}>AI goes first</button>
      <button onClick={onBack}>Back</button>
      </div>
    </div>
  );
}
