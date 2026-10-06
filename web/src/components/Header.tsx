export default function Header({ compact = false }: { compact?: boolean }) {
  if (compact)
    return (
      <header className="title compact">
        <span className="brand">Nim</span>
        <span className="subtitle">last match loses</span>
      </header>
    );
  return (
    <header className="title">
      <h1>Nim</h1>
      <p className="subtitle">last match loses</p>
    </header>
  );
}
