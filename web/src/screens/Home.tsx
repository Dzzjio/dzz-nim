import Header from '../components/Header';
export default function Home({ onLocal, onOnline }: { onLocal(): void; onOnline(): void }) {
  return (
    <div className="screen">
      <div className="panel">
      <Header />
      <p className="lead">Take any number of matches from one row. Whoever takes the last one loses.</p>
      <nav className="menu">
        <button className="menu-item" onClick={onLocal}>
          <span>Play the machine</span>
          <span aria-hidden="true">→</span>
        </button>
        <button className="menu-item" onClick={onOnline}>
          <span>Play a friend</span>
          <span aria-hidden="true">→</span>
        </button>
      </nav>
      </div>
    </div>
  );
}
