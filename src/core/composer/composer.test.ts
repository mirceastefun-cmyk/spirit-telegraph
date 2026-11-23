import { describe, expect, it } from 'vitest';
import { Composer, MAX_BUFFER_LENGTH } from './composer';
import type { CommandName } from '@/core/signal/types';

const ch = (value: string) => ({ kind: 'char', value }) as const;
const cmd = (name: CommandName) => ({ kind: 'command', name }) as const;

function withText(text: string): Composer {
  const c = new Composer();
  for (const v of text) c.apply(v === ' ' ? { kind: 'space' } : ch(v));
  return c;
}

describe('Composer.apply', () => {
  it('appends a char', () => {
    const c = new Composer();
    expect(c.apply(ch('A'))).toEqual([{ type: 'letter-added', char: 'A', buffer: 'A' }]);
    expect(c.buffer).toBe('A');
  });

  it('ignores char at capacity', () => {
    const c = new Composer();
    for (let i = 0; i < MAX_BUFFER_LENGTH; i++) c.apply(ch('A'));
    expect(c.buffer.length).toBe(10000);
    expect(c.apply(ch('B'))).toEqual([]);
    expect(c.buffer.length).toBe(10000);
  });

  it('space on empty buffer returns []', () => {
    const c = new Composer();
    expect(c.apply({ kind: 'space' })).toEqual([]);
    expect(c.buffer).toBe('');
  });

  it('space after space returns []', () => {
    const c = withText('HI ');
    expect(c.apply({ kind: 'space' })).toEqual([]);
    expect(c.buffer).toBe('HI ');
  });

  it('space on non-empty buffer emits word-completed with last word', () => {
    const c = withText('HI THERE');
    expect(c.apply({ kind: 'space' })).toEqual([
      { type: 'word-completed', word: 'THERE', buffer: 'HI THERE ' },
    ]);
    expect(c.buffer).toBe('HI THERE ');
  });

  it('command SPACE behaves like space', () => {
    const c = withText('HI');
    expect(c.apply(cmd('SPACE'))).toEqual([{ type: 'word-completed', word: 'HI', buffer: 'HI ' }]);
    expect(c.apply(cmd('SPACE'))).toEqual([]);
  });

  it('BACKSPACE removes last char', () => {
    const c = withText('AB');
    expect(c.apply(cmd('BACKSPACE'))).toEqual([{ type: 'letter-removed', buffer: 'A' }]);
    expect(c.buffer).toBe('A');
  });

  it('BACKSPACE on empty returns []', () => {
    expect(new Composer().apply(cmd('BACKSPACE'))).toEqual([]);
  });

  it('CLEAR requests clear and keeps buffer', () => {
    const c = withText('HI');
    expect(c.apply(cmd('CLEAR'))).toEqual([{ type: 'clear-requested', text: 'HI' }]);
    expect(c.buffer).toBe('HI');
  });

  it('SPEAK requests speech', () => {
    const c = withText('HI');
    expect(c.apply(cmd('SPEAK'))).toEqual([{ type: 'speak-requested', text: 'HI' }]);
    expect(c.buffer).toBe('HI');
  });

  it('HELP, ACCEPT_SUGGESTION, NEXT_SUGGESTION emit their events', () => {
    const c = new Composer();
    expect(c.apply(cmd('HELP'))).toEqual([{ type: 'help-requested' }]);
    expect(c.apply(cmd('ACCEPT_SUGGESTION'))).toEqual([{ type: 'suggestion-accept' }]);
    expect(c.apply(cmd('NEXT_SUGGESTION'))).toEqual([{ type: 'suggestion-next' }]);
  });

  it('unknown emits unknown-symbol', () => {
    expect(new Composer().apply({ kind: 'unknown' })).toEqual([{ type: 'unknown-symbol' }]);
  });

  it('answer returns []', () => {
    const c = withText('A');
    expect(c.apply({ kind: 'answer', value: 'yes' })).toEqual([]);
    expect(c.buffer).toBe('A');
  });
});

describe('Composer reset and confirmClear', () => {
  it('confirmClear empties the buffer', () => {
    const c = withText('HI');
    c.confirmClear();
    expect(c.buffer).toBe('');
  });

  it('reset empties the buffer', () => {
    const c = withText('HI');
    c.reset();
    expect(c.buffer).toBe('');
  });
});
