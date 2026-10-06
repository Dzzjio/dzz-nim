import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Board from './Board';

const piles = [1, 3, 5, 7];

describe('Board', () => {
  it('selects i..end of the row and Take fires once', () => {
    const onMove = vi.fn();
    render(<Board piles={piles} disabled={false} onMove={onMove} />);
    fireEvent.click(screen.getByLabelText('Take 4 from row 3'));
    const take = screen.getByRole('button', { name: 'Take' });
    fireEvent.click(take);
    fireEvent.click(take);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith({ pile: 2, count: 4 });
    expect(take).toBeDisabled();
  });

  it('selection in another row replaces the previous one', () => {
    const onMove = vi.fn();
    render(<Board piles={piles} disabled={false} onMove={onMove} />);
    fireEvent.click(screen.getByLabelText('Take 5 from row 3'));
    fireEvent.click(screen.getByLabelText('Take 1 from row 4'));
    fireEvent.click(screen.getByRole('button', { name: 'Take' }));
    expect(onMove).toHaveBeenCalledWith({ pile: 3, count: 1 });
  });

  it('Take disabled with no selection or when disabled', () => {
    const onMove = vi.fn();
    const { rerender } = render(<Board piles={piles} disabled={false} onMove={onMove} />);
    expect(screen.getByRole('button', { name: 'Take' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Take 3 from row 2'));
    rerender(<Board piles={piles} disabled={true} onMove={onMove} />);
    const take = screen.getByRole('button', { name: 'Take' });
    expect(take).toBeDisabled();
    fireEvent.click(take);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('shows burning ghosts for removed matches, then drops them', () => {
    vi.useFakeTimers();
    try {
      const onMove = vi.fn();
      const { container, rerender } = render(<Board piles={piles} disabled={false} onMove={onMove} />);
      expect(container.querySelectorAll('.ghost')).toHaveLength(0);
      rerender(<Board piles={[1, 3, 2, 7]} disabled={false} onMove={onMove} />);
      expect(container.querySelectorAll('.ghost')).toHaveLength(3);
      expect(container.querySelectorAll('.ghost[aria-hidden="true"]')).toHaveLength(3);
      act(() => { vi.advanceTimersByTime(1000); });
      expect(container.querySelectorAll('.ghost')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not show ghosts when piles grow (new game)', () => {
    const onMove = vi.fn();
    const { container, rerender } = render(<Board piles={[0, 1, 2, 3]} disabled={false} onMove={onMove} />);
    rerender(<Board piles={piles} disabled={false} onMove={onMove} />);
    expect(container.querySelectorAll('.ghost')).toHaveLength(0);
  });

  it('clears the selection when piles change', () => {
    const onMove = vi.fn();
    const { rerender } = render(<Board piles={piles} disabled={false} onMove={onMove} />);
    fireEvent.click(screen.getByLabelText('Take 4 from row 3'));
    expect(screen.getByRole('button', { name: 'Take' })).toBeEnabled();
    rerender(<Board piles={[1, 3, 4, 7]} disabled={false} onMove={onMove} />);
    expect(screen.getByRole('button', { name: 'Take' })).toBeDisabled();
    expect(screen.getByLabelText('Take 3 from row 3')).toHaveAttribute('aria-pressed', 'false');
  });
});
