import Header from '../components/Header';
export default function Home({ onLocal, onOnline }: { onLocal(): void; onOnline(): void }) {
  return (
    <div className="screen">
      <div className="panel">
      <Header />
      <p className="lead">Take the last match and you lose.</p>
      <button onClick={onLocal}>Play vs AI</button>
      <button onClick={onOnline}>Play online</button>
      </div>
    </div>
  );
}
