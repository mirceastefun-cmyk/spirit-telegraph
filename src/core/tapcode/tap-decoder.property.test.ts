// Feature: signal-core, Property 3: Tap-code round-trip
import fc from 'fast-check';
import { describe, it } from 'vitest';
import { decodeTimeline } from '../signal/signal-event';
import type { Token } from '../signal/types';
import { TapDecoder } from './tap-decoder';
import { tapEncodeTimeline } from './tap-encoder';

const tapAlphabetChars: string[] = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const textArb = fc
  .array(fc.constantFrom(...tapAlphabetChars, ' '), { minLength: 1 })
  .map((arr) => arr.join(''));

const timingArb = fc.record({
  knockIntervalMs: fc.integer({ min: 100, max: 300 }),
  groupPauseMs: fc.integer({ min: 400, max: 800 }),
  letterPauseMs: fc.integer({ min: 1000, max: 3000 }),
});

function tokensToString(tokens: readonly Token[]): string {
  return tokens
    .map((t) => (t.kind === 'char' ? t.value : t.kind === 'space' ? ' ' : `<${t.kind}>`))
    .join('');
}

function normalise(text: string): string {
  return text.replace(/ +/g, ' ').trim();
}

describe('TapDecoder properties', () => {
  it('P3: decoding an encoded text returns the normalised original (K -> C)', () => {
    // **Validates: Requirements 8 (R11.3)**
    fc.assert(
      fc.property(textArb, timingArb, (text, timing) => {
        const events = tapEncodeTimeline(text, timing);
        const tokens = decodeTimeline(new TapDecoder(timing), events);
        const decoded = normalise(tokensToString(tokens));
        return decoded === normalise(text.toUpperCase().replace(/K/g, 'C'));
      }),
      { numRuns: 100 },
    );
  });
});
