import { describe, expect, it } from 'vitest';
import { MORSE_ALPHABET, morsePattern } from './morse-alphabet';

describe('MORSE_ALPHABET', () => {
  it('has exactly 48 entries', () => {
    expect(MORSE_ALPHABET.size).toBe(48);
  });

  it('resolves letters case-insensitively', () => {
    expect(morsePattern('A')).toBe('.-');
    expect(morsePattern('a')).toBe('.-');
  });

  it('returns undefined for unknown characters, including +', () => {
    expect(morsePattern('+')).toBeUndefined();
    expect(morsePattern('#')).toBeUndefined();
    expect(morsePattern('')).toBeUndefined();
    expect(MORSE_ALPHABET.has('+')).toBe(false);
  });

  it('ignores mutation attempts', () => {
    const m = MORSE_ALPHABET as Map<string, string>;
    m.set('a', '-');
    m.set('+', '.-.-.');
    m.delete('b');
    m.clear();
    expect(MORSE_ALPHABET.size).toBe(48);
    expect(morsePattern('a')).toBe('.-');
    expect(morsePattern('b')).toBe('-...');
    expect(morsePattern('+')).toBeUndefined();
    expect(Object.isFrozen(MORSE_ALPHABET)).toBe(true);
  });

  it('has non-empty dot/dash-only patterns', () => {
    for (const pattern of MORSE_ALPHABET.values()) {
      expect(pattern).toMatch(/^[.-]+$/);
    }
  });

  it('has unique patterns', () => {
    expect(new Set(MORSE_ALPHABET.values()).size).toBe(48);
  });
});
