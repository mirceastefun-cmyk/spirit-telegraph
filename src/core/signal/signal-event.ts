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
