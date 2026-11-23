import type { SignalEvent } from '../signal/signal-event';
import { tapPattern } from './tap-alphabet';

/**
 * Encodes text as `[row, col]` tap pairs. Case-insensitive, K maps to C;
 * unsupported characters (digits, punctuation, whitespace) are skipped.
 *
 * Implements signal-core R8.2, R8.2a
 */
export function tapEncode(text: string): [number, number][] {
  const out: [number, number][] = [];
  for (const ch of text) {
    const p = tapPattern(ch);
    if (p) out.push(p);
  }
  return out;
}

/**
 * Builds a knock-pulse timeline for text. Each letter emits `row` pulses,
 * a group pause, `col` pulses, then a letter pause. A space emits no pulses
 * and advances time by 2.5 x `letterPauseMs`, which exceeds the double
 * letter-pause word-gap threshold. Unsupported characters are skipped.
 * The first pulse is at t = 0 (unless the text starts with a space).
 * Times are rounded to integers.
 *
 * Implements signal-core R8.2, R8.3, R8.9
 */
export function tapEncodeTimeline(
  text: string,
  timingMs: {
    knockIntervalMs: number;
    groupPauseMs: number;
    letterPauseMs: number;
  },
): SignalEvent[] {
  const { knockIntervalMs, groupPauseMs, letterPauseMs } = timingMs;
  const events: SignalEvent[] = [];
  let cursor = 0;

  const knock = (): void => {
    events.push({ type: 'pulse', t: Math.round(cursor), source: 'knock', channel: 0 });
  };
  const group = (n: number): void => {
    for (let i = 0; i < n; i++) {
      if (i > 0) cursor += knockIntervalMs;
      knock();
    }
  };

  for (const ch of text) {
    if (ch === ' ') {
      cursor += 2.5 * letterPauseMs;
      continue;
    }
    const p = tapPattern(ch);
    if (!p) continue;
    group(p[0]);
    cursor += groupPauseMs;
    group(p[1]);
    cursor += letterPauseMs;
  }

  return events;
}
