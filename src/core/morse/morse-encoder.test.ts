import { describe, expect, it } from 'vitest';
import { morseEncode } from './morse-encoder';

const U = 100;
const ts = (text: string) => morseEncode(text, U, 'switch').map((e) => `${e.type}@${e.t}`);

describe('morseEncode', () => {
  it('encodes a dot as one down/up pair of unitMs', () => {
    expect(ts('e')).toEqual(['down@0', 'up@100']);
  });

  it('encodes a dash as one down/up pair of 3 x unitMs', () => {
    expect(ts('t')).toEqual(['down@0', 'up@300']);
  });

  it('separates elements by 1 unit', () => {
    // A = .-
    expect(ts('a')).toEqual(['down@0', 'up@100', 'down@200', 'up@500']);
  });

  it('separates letters by 3 units', () => {
    // E E
    expect(ts('ee')).toEqual(['down@0', 'up@100', 'down@400', 'up@500']);
  });

  it('separates words by 7 units', () => {
    expect(ts('e e')).toEqual(['down@0', 'up@100', 'down@800', 'up@900']);
  });

  it('skips unknown characters without altering timing', () => {
    expect(ts('e#e')).toEqual(ts('ee'));
    expect(ts('#')).toEqual([]);
  });

  it('returns [] for the empty string', () => {
    expect(morseEncode('', U, 'switch')).toEqual([]);
  });

  it('throws RangeError for out-of-range unitMs', () => {
    for (const bad of [39, 3001, 0, -5, NaN]) {
      expect(() => morseEncode('e', bad, 'switch')).toThrow(RangeError);
    }
    expect(() => morseEncode('e', 39, 'switch')).toThrow('unitMs must be in [40, 3000]');
    expect(() => morseEncode('e', 40, 'switch')).not.toThrow();
    expect(() => morseEncode('e', 3000, 'switch')).not.toThrow();
  });

  it('produces strictly increasing timestamps starting at 0', () => {
    const events = morseEncode('hello world 123', 50, 'knock');
    expect(events[0]?.t).toBe(0);
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.t).toBeGreaterThan(events[i - 1]!.t);
    }
  });

  it('assigns source and channel 0 to every event', () => {
    for (const source of ['switch', 'blink', 'knock'] as const) {
      const events = morseEncode('sos', U, source);
      expect(events.length).toBe(18);
      expect(events.every((e) => e.source === source && e.channel === 0)).toBe(true);
    }
  });
});
