import type { SignalEvent, SignalSource } from '../signal/signal-event';
import type { AnswerToken } from '../signal/types';

/** Implements signal-core R9.1 */
export interface YesNoDecoderConfig {
  /** Silence after the last signal before the window resolves, in ms. Range [500, 10000]. Default: 1500. */
  readonly settleMs?: number;
  /** When set, only events from this source are counted. */
  readonly source?: SignalSource;
}

const MIN_SETTLE_MS = 500;
const MAX_SETTLE_MS = 10000;
const DEFAULT_SETTLE_MS = 1500;

/**
 * Counts `'down'`/`'pulse'` events in a settle window: one signal means yes,
 * two mean no, any other count yields no answer.
 * Time is supplied by the caller; the decoder never reads a clock.
 *
 * Implements signal-core R9.1, R9.2, R9.3, R9.4, R9.5, R9.6, R9.7
 */
export class YesNoDecoder {
  private readonly settleMs: number;
  private readonly source: SignalSource | undefined;
  private count = 0;
  private lastSignalT: number | null = null;
  private settled = false;

  /** Implements signal-core R9.1 */
  constructor(config: YesNoDecoderConfig = {}) {
    const settleMs = config.settleMs ?? DEFAULT_SETTLE_MS;
    if (!(settleMs >= MIN_SETTLE_MS && settleMs <= MAX_SETTLE_MS)) {
      throw new RangeError('settleMs must be in [500, 10000]');
    }
    this.settleMs = settleMs;
    this.source = config.source;
  }

  /**
   * Counts a matching `'down'` or `'pulse'` event. Always returns null.
   * Implements signal-core R9.2, R9.3, R9.7
   */
  feed(event: SignalEvent): AnswerToken | null {
    if (event.type === 'up') return null;
    if (this.source !== undefined && event.source !== this.source) return null;
    this.count += 1;
    this.lastSignalT = event.t;
    this.settled = false;
    return null;
  }

  /**
   * Resolves the window once `settleMs` has elapsed since the last signal.
   * Implements signal-core R9.4, R9.5, R9.6
   */
  tick(nowMs: number): AnswerToken | null {
    if (this.lastSignalT === null || this.settled) return null;
    if (nowMs - this.lastSignalT < this.settleMs) return null;

    let result: AnswerToken | null = null;
    if (this.count === 1) result = { kind: 'answer', value: 'yes' };
    else if (this.count === 2) result = { kind: 'answer', value: 'no' };

    this.settled = true;
    this.count = 0;
    this.lastSignalT = null;
    return result;
  }
}
