import { useEffect, useRef, useState } from 'react';
import type { Move } from '@nim/shared';

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
              />
            );
          })}
        </div>
      ))}
      <button type="button" className="take" disabled={disabled || sel === null} onClick={take}>
        Take
      </button>
    </div>
  );
}
