import fc from 'fast-check';
import { describe, it } from 'vitest';
import { buildTimeline, decodeTimeline } from '../signal/signal-event';
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

  // Feature: signal-core, Property 2: Jitter tolerance
  it('P2: decoding survives ±25% independent jitter on every press and silence', () => {
    // **Validates: Requirements 6 (R11.2)**
    const jitterArb = fc.array(fc.double({ min: 0.75, max: 1.25, noNaN: true }), {
      minLength: 512,
      maxLength: 512,
    });
    fc.assert(
      fc.property(textArb, unitArb, jitterArb, (text, unitMs, jitters) => {
        const events = morseEncode(text, unitMs, 'switch');
        const descriptors = events.map((e, i) => {
          const prev = i === 0 ? e.t : events[i - 1]!.t;
          const dt = Math.max(0, Math.round((e.t - prev) * jitters[i % jitters.length]!));
          return { type: e.type, dt, source: e.source, channel: e.channel };
        });
        const jittered = buildTimeline(descriptors, 0);
        const tokens = decodeTimeline(new MorseDecoder({ initialUnitMs: unitMs }), jittered);
        return tokensToString(tokens).trim() === normalise(text);
      }),
      { numRuns: 100 },
    );
  });
});
