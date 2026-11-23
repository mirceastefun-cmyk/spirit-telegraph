import fc from 'fast-check';
import { describe, it } from 'vitest';
import { decodeTimeline } from '../signal/signal-event';
import type { Token } from '../signal/types';
import { MORSE_ALPHABET } from './morse-alphabet';
import { MorseDecoder } from './morse-decoder';
import { morseEncode } from './morse-encoder';

const morseAlphabetChars: string[] = [...MORSE_ALPHABET.keys()];

const textArb = fc
  .array(fc.constantFrom(...morseAlphabetChars, ' '), { minLength: 1 })
  .map((arr) => arr.join(''));
const unitArb = fc.integer({ min: 40, max: 3000 });

function tokensToString(tokens: readonly Token[]): string {
  return tokens
    .map((t) => (t.kind === 'char' ? t.value : t.kind === 'space' ? ' ' : `<${t.kind}>`))
    .join('');
}

function normalise(text: string): string {
  return text.toUpperCase().replace(/ +/g, ' ').trim();
}

describe('MorseDecoder properties', () => {
  // Feature: signal-core, Property 1: Morse round-trip
  it('P1: decoding an encoded text returns the normalised original', () => {
    // **Validates: Requirements 3, 4 (R11.1)**
    fc.assert(
      fc.property(textArb, unitArb, (text, unitMs) => {
        const events = morseEncode(text, unitMs, 'switch');
        const tokens = decodeTimeline(new MorseDecoder({ initialUnitMs: unitMs }), events);
        const decoded = tokensToString(tokens).trim();
        return decoded === normalise(text);
      }),
      { numRuns: 100 },
    );
  });
});
