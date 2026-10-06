import { useEffect, useRef, useState } from 'react';
import type { Move } from '@nim/shared';

const BURN_MS = 700;

interface Props {
  piles: number[];
  disabled: boolean;
  onMove(move: Move): void;
}

export default function Board({ piles, disabled, onMove }: Props) {
  const [sel, setSel] = useState<Move | null>(null);
  const selRef = useRef<Move | null>(null);

  const select = (next: Move | null) => {
    selRef.current = next;
    setSel(next);
  };

  const pilesKey = piles.join(',');
  useEffect(() => {
    selRef.current = null;
    setSel(null);
  }, [pilesKey]);

  // Matches that just left a row linger as burning "ghosts" for a moment.
  const [ghosts, setGhosts] = useState<number[]>([]);
  const prevPiles = useRef(piles);
  useEffect(() => {
    const prev = prevPiles.current;
    prevPiles.current = piles;
    if (prev.length !== piles.length || piles.some((c, i) => c > prev[i])) {
      setGhosts([]);
      return;
    }
    const gone = piles.map((c, i) => prev[i] - c);
    if (gone.every((g) => g === 0)) return;
    setGhosts(gone);
    const t = setTimeout(() => setGhosts([]), BURN_MS);
    return () => clearTimeout(t);
  }, [pilesKey]);

  const take = () => {
    const current = selRef.current;
    if (disabled || !current) return;
    select(null); // clear synchronously so a rapid second click is a no-op
    onMove(current);
  };

  return (
    <div className="board">
      {piles.map((count, pile) => (
        <div className="row" key={pile}>
          {Array.from({ length: count }, (_, i) => {
            const selected = sel !== null && sel.pile === pile && i >= count - sel.count;
            return (
              <button
                key={i}
                type="button"
                aria-label={`Take ${count - i} from row ${pile + 1}`}
                aria-pressed={selected}
                className={'match' + (selected ? ' selected' : '')}
                disabled={disabled}
                onClick={() => select({ pile, count: count - i })}
              >
                {selected && <span className="flame" aria-hidden="true" />}
              </button>
            );
          })}
          {Array.from({ length: ghosts[pile] ?? 0 }, (_, g) => (
            <span key={`g${g}`} className="ghost" aria-hidden="true" style={{ animationDelay: `${g * 60}ms` }}>
              <span className="flame" />
            </span>
          ))}
        </div>
      ))}
      <button type="button" className="take" disabled={disabled || sel === null} onClick={take}>
        Take
      </button>
    </div>
  );
}
