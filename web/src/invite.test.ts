import { describe, it, expect } from 'vitest';
import { buildInviteLink, parseInviteCode, stripInviteFromUrl } from './invite';

describe('parseInviteCode', () => {
  it('reads and uppercases a valid room code', () => {
    expect(parseInviteCode('?room=abcd')).toBe('ABCD');
    expect(parseInviteCode('?foo=1&room=WXYZ')).toBe('WXYZ');
  });
  it('ignores missing or malformed codes', () => {
    expect(parseInviteCode('')).toBeNull();
    expect(parseInviteCode('?room=')).toBeNull();
    expect(parseInviteCode('?room=ABC')).toBeNull();
    expect(parseInviteCode('?room=ABCDE')).toBeNull();
    expect(parseInviteCode('?room=AB1D')).toBeNull();
    expect(parseInviteCode('?room=<b>')).toBeNull();
  });
});

describe('buildInviteLink', () => {
  it('uses origin and path with the room param', () => {
    expect(buildInviteLink('ABCD', { origin: 'https://nim.app', pathname: '/' })).toBe('https://nim.app/?room=ABCD');
    expect(buildInviteLink('ABCD', { origin: 'http://localhost:5173', pathname: '/play/' })).toBe(
      'http://localhost:5173/play/?room=ABCD',
    );
  });
});

describe('stripInviteFromUrl', () => {
  it('removes only the room param from the address bar', () => {
    window.history.replaceState(null, '', '/?room=ABCD&x=1#h');
    stripInviteFromUrl();
    expect(window.location.search).toBe('?x=1');
    expect(window.location.hash).toBe('#h');
    window.history.replaceState(null, '', '/?room=ABCD');
    stripInviteFromUrl();
    expect(window.location.search).toBe('');
  });
});
