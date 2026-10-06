import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import App from './App';
import { SESSION_KEY } from './hooks/useOnlineGame';

class FakeWS {
  static instances: FakeWS[] = [];
  readyState = 0;
  sent: any[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeWS.instances.push(this);
  }
  send(d: string) { this.sent.push(JSON.parse(d)); }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.();
  }
  open() { this.readyState = 1; this.onopen?.(); }
  recv(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
}
const last = () => FakeWS.instances[FakeWS.instances.length - 1];
const at = (url: string) => window.history.replaceState(null, '', url);

describe('invite links', () => {
  beforeEach(() => {
    FakeWS.instances = [];
    sessionStorage.clear();
    vi.stubGlobal('WebSocket', FakeWS);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    at('/');
  });

  it('opening an invite link joins the room without any menu', () => {
    at('/?room=abcd');
    render(<App />);
    expect(screen.queryByText('Play a friend')).toBeNull();
    expect(screen.queryByText('Create a room')).toBeNull();
    act(() => last().open());
    expect(last().sent).toEqual([{ type: 'join', code: 'ABCD' }]);
  });

  it('joined guest lands in the game', () => {
    at('/?room=ABCD');
    render(<App />);
    act(() => last().open());
    act(() => {
      last().recv({ type: 'joined', code: 'ABCD', token: 't', seat: 1 });
      last().recv({ type: 'state', state: { piles: [1, 3, 5, 7], turn: 0, winner: null } });
    });
    expect(screen.queryByText('Connecting…')).toBeNull();
    expect(screen.queryByText('Waiting for opponent…')).toBeNull();
  });

  it('shows the existing error when the room is gone', () => {
    at('/?room=ABCD');
    render(<App />);
    act(() => last().open());
    act(() => last().recv({ type: 'error', message: 'room not found' }));
    expect(screen.getByText('room not found')).toBeInTheDocument();
  });

  it('ignores a malformed room param', () => {
    at('/?room=nope1');
    render(<App />);
    expect(screen.getByText('Play a friend')).toBeInTheDocument();
    expect(FakeWS.instances).toHaveLength(0);
  });

  it('a stored session for the same room resumes instead of joining', () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: 'ABCD', token: 'tok' }));
    at('/?room=ABCD');
    render(<App />);
    act(() => last().open());
    expect(last().sent).toEqual([{ type: 'reconnect', code: 'ABCD', token: 'tok' }]);
  });

  it('a stored session for another room is replaced by the invite', () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: 'WXYZ', token: 'old' }));
    at('/?room=ABCD');
    render(<App />);
    act(() => last().open());
    expect(last().sent).toEqual([{ type: 'join', code: 'ABCD' }]);
  });

  it('leaving strips the invite so the room is not re-entered', () => {
    at('/?room=ABCD');
    render(<App />);
    act(() => last().open());
    act(() => last().recv({ type: 'error', message: 'room not found' }));
    fireEvent.click(screen.getByText('← Back'));
    expect(window.location.search).toBe('');
    fireEvent.click(screen.getByText('Play a friend'));
    expect(screen.getByText('Create a room')).toBeInTheDocument();
  });
});

describe('invite button', () => {
  beforeEach(() => {
    FakeWS.instances = [];
    sessionStorage.clear();
    vi.stubGlobal('WebSocket', FakeWS);
    at('/');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  });

  const createRoom = async () => {
    render(<App />);
    fireEvent.click(screen.getByText('Play a friend'));
    fireEvent.click(screen.getByText('Create a room'));
    act(() => last().open());
    act(() => last().recv({ type: 'joined', code: 'ABCD', token: 't', seat: 0 }));
  };

  it('copies the invite link when sharing is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await createRoom();
    await act(async () => { fireEvent.click(screen.getByText('Invite a friend')); });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/?room=ABCD`);
    expect(screen.getByText('Link copied')).toBeInTheDocument();
  });

  it('uses the native share sheet when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    await createRoom();
    await act(async () => { fireEvent.click(screen.getByText('Invite a friend')); });
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: `${window.location.origin}/?room=ABCD` }));
  });
});
