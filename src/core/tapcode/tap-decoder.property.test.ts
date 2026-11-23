// Feature: signal-core, Property 3: Tap-code round-trip
import fc from 'fast-check';
import { describe, it } from 'vitest';
import { buildTimeline, decodeTimeline, type TimelineDescriptor } from '../signal/signal-event';
import type { CommandName, Token } from '../signal/types';
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

  // Feature: signal-core, Property 10: Tap command decoding
  it('P10: row-6 groups decode to commands and 8+ pulses decode to HELP', () => {
    // **Validates: Requirements 8.5a, 8.6a** (implements R11.10)
    const expected: Record<number, CommandName> = {
      1: 'SPACE',
      2: 'BACKSPACE',
      3: 'SPEAK',
      4: 'ACCEPT_SUGGESTION',
      5: 'NEXT_SUGGESTION',
    };
    const pulse = (dt: number): TimelineDescriptor => ({ type: 'pulse', dt, source: 'knock' });
    fc.assert(
      fc.property(
        timingArb,
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 8, max: 15 }),
        (timing, col, helpCount) => {
          // Final gap stays below two letter thresholds so no trailing space token is emitted.
          const finalGap = timing.letterPauseMs;

          const descriptors: TimelineDescriptor[] = [];
          for (let i = 0; i < 6; i++) descriptors.push(pulse(i === 0 ? 0 : timing.knockIntervalMs));
          for (let i = 0; i < col; i++) {
            descriptors.push(pulse(i === 0 ? timing.groupPauseMs : timing.knockIntervalMs));
          }
          const cmdTokens = decodeTimeline(
            new TapDecoder(timing),
            buildTimeline(descriptors),
            finalGap,
          );
          if (cmdTokens.length !== 1) return false;
          const tok = cmdTokens[0]!;
          if (tok.kind !== 'command' || tok.name !== expected[col]) return false;

          const help: TimelineDescriptor[] = [];
          for (let i = 0; i < helpCount; i++) help.push(pulse(i === 0 ? 0 : timing.knockIntervalMs));
          const helpTokens = decodeTimeline(new TapDecoder(timing), buildTimeline(help), finalGap);
          const h = helpTokens[0];
          return helpTokens.length === 1 && h?.kind === 'command' && h.name === 'HELP';
        },
      ),
      { numRuns: 100 },
    );
  });
});
