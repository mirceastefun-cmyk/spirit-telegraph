import type { Token } from './types';

/**
 * The single signal type that every sensor emits.
 * Implements signal-core R1.1
 */
export type SignalSource = 'switch' | 'blink' | 'knock';

/** Implements signal-core R1.1 */
export interface SignalEvent {
  readonly type: 'down' | 'up' | 'pulse';
  /** Absolute timestamp in milliseconds, integer in [0, 2^53 − 1]. */
  readonly t: number;
  readonly source: SignalSource;
  /** Physical input channel; 0 = default/dot, 1 = dash. */
  readonly channel: 0 | 1;
}

/** Implements signal-core R1.2 */
export interface TimelineDescriptor {
  readonly type: 'down' | 'up' | 'pulse';
  /** Milliseconds of silence before this event (non-negative integer). */
  readonly dt: number;
  readonly source: SignalSource;
  readonly channel?: 0 | 1;
}

/**
 * Builds a SignalEvent timeline from descriptors and an optional start time.
 * Implements signal-core R1.2, R1.3, R1.4
 *
 * @param descriptors - Array of timeline descriptors with relative offsets (`dt`).
 * @param t0 - Start time in milliseconds (integer ≥ 0). Defaults to 0.
 * @returns A SignalEvent[] with each event's `t` equal to `t0` plus the
 *          cumulative sum of all preceding `dt` values.
 * @throws {RangeError} If any descriptor has a negative `dt`.
 */
export function buildTimeline(
  descriptors: readonly TimelineDescriptor[],
  t0 = 0,
): SignalEvent[] {
  const events: SignalEvent[] = [];
  let cursor = t0;

  for (const desc of descriptors) {
    if (desc.dt < 0) {
      throw new RangeError('dt must be a non-negative integer');
    }
    cursor += desc.dt;
    events.push({
      type: desc.type,
      t: cursor,
      source: desc.source,
      channel: desc.channel ?? 0,
    });
  }

  return events;
}

/**
 * Drives a decoder with a pre-built SignalEvent timeline, using tick-before-feed
 * ordering so pending symbols are flushed before each new signal is processed.
 *
 * Algorithm:
 *   For each event: tick(event.t) → collect tokens, then feed(event) → collect tokens.
 *   After the last event: tick(lastEvent.t + finalGapMs) → collect tokens.
 *   Return all tokens in arrival order.
 *
 * The tick-before-feed ordering prevents the EE→I bug: without it,
 * `· [letter-gap] ·` would be presented as `··` to the decoder and decoded as I.
 *
 * Implements signal-core R11.1–R11.10
 *
 * @param decoder - Any decoder with `feed` and `tick` methods returning Token[].
 * @param events - Pre-built timeline of SignalEvents to replay.
 * @param finalGapMs - Silence appended after the last event to flush pending symbols (default 30000 ms).
 * @returns All tokens emitted by the decoder, in arrival order.
 */
export function decodeTimeline(
  decoder: {
    feed(e: SignalEvent): Token[];
    tick(nowMs: number): Token[];
  },
  events: SignalEvent[],
  finalGapMs = 30000,
): Token[] {
  if (events.length === 0) return [];

  const tokens: Token[] = [];

  for (const event of events) {
    for (const t of decoder.tick(event.t)) tokens.push(t);
    for (const t of decoder.feed(event)) tokens.push(t);
  }

  const lastEvent = events[events.length - 1]!;
  for (const t of decoder.tick(lastEvent.t + finalGapMs)) tokens.push(t);

  return tokens;
}
