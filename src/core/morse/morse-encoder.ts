import type { SignalEvent, SignalSource } from '../signal/signal-event';
import { morsePattern } from './morse-alphabet';

const MIN_UNIT_MS = 40;
const MAX_UNIT_MS = 3000;

/**
 * Encodes text as a Morse SignalEvent timeline.
 *
 * Timing: dot = 1 unit, dash = 3 units, inter-element gap = 1 unit,
 * inter-letter gap = 3 units, inter-word gap = 7 units. The first event is at
 * t = 0. Whitespace separates words (runs, leading and trailing whitespace
 * add no extra time). Characters outside the Morse alphabet are skipped and do
 * not alter the timing of the rest. All events carry `channel: 0`.
 *
 * Implements signal-core R3.1, R3.2, R3.3, R3.4, R3.5, R3.6, R3.7
 *
 * @param text - Text to encode (case-insensitive).
 * @param unitMs - Unit length in ms, integer in [40, 3000].
 * @param source - Source assigned to every event.
 * @returns The event timeline; empty when nothing is encodable.
 * @throws {RangeError} If `unitMs` is outside [40, 3000].
 */
export function morseEncode(text: string, unitMs: number, source: SignalSource): SignalEvent[] {
  if (!(unitMs >= MIN_UNIT_MS && unitMs <= MAX_UNIT_MS)) {
    throw new RangeError('unitMs must be in [40, 3000]');
  }

  const events: SignalEvent[] = [];
  let cursor = 0;
  let wordBreak = false;
  let hasLetter = false;

  for (const ch of text) {
    if (/\s/.test(ch)) {
      wordBreak = true;
      continue;
    }
    const pattern = morsePattern(ch);
    if (pattern === undefined) continue;

    if (hasLetter) cursor += (wordBreak ? 7 : 3) * unitMs;
    wordBreak = false;
    hasLetter = true;

    for (let i = 0; i < pattern.length; i++) {
      if (i > 0) cursor += unitMs;
      events.push({ type: 'down', t: cursor, source, channel: 0 });
      cursor += (pattern[i] === '-' ? 3 : 1) * unitMs;
      events.push({ type: 'up', t: cursor, source, channel: 0 });
    }
  }

  return events;
}
