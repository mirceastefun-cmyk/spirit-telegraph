import type { Thresholds } from '../signal/types';

export type { Thresholds };

/** Implements signal-core R6 */
export interface AdaptiveTimingConfig {
  /** Starting unit duration in ms, [40, 3000]. */
  readonly initialUnitMs: number;
  /** Letter gap multiplier, [1.5, 6.0]. Default 1.75. */
  readonly letterGapFactor?: number;
  /** Word gap multiplier, [3.0, 12.0], strictly greater than letterGapFactor. Default 4.5. */
  readonly wordGapFactor?: number;
  /** EMA smoothing factor, [0.05, 0.5]. Default 0.15. */
  readonly alpha?: number;
  /** Accepted observations before estimates are trusted, [2, 20]. Default 6. */
  readonly warmUpCount?: number;
}

const MIN_UNIT_MS = 40;
const MAX_UNIT_MS = 3000;
const MIN_LONG_HOLD_MS = 3000;

function checkRange(name: string, value: number, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be a number in [${min}, ${max}], got ${value}`);
  }
}

/**
 * Online estimator of dot/dash durations and the gap thresholds derived from them.
 * Implements signal-core R6.1, R6.2, R6.3, R6.3a, R6.4, R6.4a, R6.5, R6.6, R6.7, R6.8, R6.9, R6.10
 */
export class AdaptiveTiming {
  private readonly initialUnitMs: number;
  private readonly letterGapFactor: number;
  private readonly wordGapFactor: number;
  private readonly alpha: number;
  private readonly warmUpCount: number;

  private dotMeanMs: number;
  private dashMeanMs: number;
  private observed = 0;

  /** Implements signal-core R6.10 (validation) */
  constructor(config: AdaptiveTimingConfig) {
    const letterGapFactor = config.letterGapFactor ?? 1.75;
    const wordGapFactor = config.wordGapFactor ?? 4.5;
    const alpha = config.alpha ?? 0.15;
    const warmUpCount = config.warmUpCount ?? 6;

    checkRange('initialUnitMs', config.initialUnitMs, MIN_UNIT_MS, MAX_UNIT_MS);
    checkRange('letterGapFactor', letterGapFactor, 1.5, 6.0);
    checkRange('wordGapFactor', wordGapFactor, 3.0, 12.0);
    if (wordGapFactor <= letterGapFactor) {
      throw new RangeError(
        `wordGapFactor (${wordGapFactor}) must be strictly greater than letterGapFactor (${letterGapFactor})`,
      );
    }
    checkRange('alpha', alpha, 0.05, 0.5);
    checkRange('warmUpCount', warmUpCount, 2, 20);
    if (!Number.isInteger(warmUpCount)) {
      throw new RangeError(`warmUpCount must be an integer, got ${warmUpCount}`);
    }

    this.initialUnitMs = config.initialUnitMs;
    this.letterGapFactor = letterGapFactor;
    this.wordGapFactor = wordGapFactor;
    this.alpha = alpha;
    this.warmUpCount = warmUpCount;
    this.dotMeanMs = this.initialUnitMs;
    this.dashMeanMs = 3 * this.initialUnitMs;
  }

  /** Raw learned dot mean in ms (not warm-up adjusted). */
  get dotMean(): number {
    return this.dotMeanMs;
  }

  /** Raw learned dash mean in ms (not warm-up adjusted). */
  get dashMean(): number {
    return this.dashMeanMs;
  }

  /** Number of accepted observations. */
  get count(): number {
    return this.observed;
  }

  private get warmingUp(): boolean {
    return this.observed < this.warmUpCount;
  }

  private get effectiveDot(): number {
    return this.warmingUp ? this.initialUnitMs : this.dotMeanMs;
  }

  private get effectiveDash(): number {
    return this.warmingUp ? 3 * this.initialUnitMs : this.dashMeanMs;
  }

  /** Current estimated dot (unit) length in ms. Implements signal-core R6.8 */
  get unitMs(): number {
    return this.effectiveDot;
  }

  /** Current thresholds, in ms. Implements signal-core R6.3a, R6.4, R6.5, R6.7, R6.8 */
  get thresholds(): Thresholds {
    const dot = this.effectiveDot;
    const dash = this.effectiveDash;
    return {
      dotDashThreshold: Math.sqrt(dot * dash),
      letterGapMin: this.letterGapFactor * dot,
      wordGapMin: this.wordGapFactor * dot,
      longHoldMs: Math.max(MIN_LONG_HOLD_MS, 3 * dash),
    };
  }

  /**
   * Observes a completed press duration in ms.
   * Presses at or beyond longHoldMs are discarded.
   * Implements signal-core R6.1, R6.2, R6.3, R6.4a, R6.6
   */
  observe(durationMs: number): void {
    const { dotDashThreshold, longHoldMs } = this.thresholds;
    if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs >= longHoldMs) return;

    if (durationMs < dotDashThreshold) {
      this.dotMeanMs = this.alpha * durationMs + (1 - this.alpha) * this.dotMeanMs;
    } else {
      this.dashMeanMs = this.alpha * durationMs + (1 - this.alpha) * this.dashMeanMs;
    }
    this.dotMeanMs = Math.min(MAX_UNIT_MS, Math.max(MIN_UNIT_MS, this.dotMeanMs));
    this.dashMeanMs = Math.max(this.dashMeanMs, 2 * this.dotMeanMs);
    this.observed += 1;
  }

  /** Restores initial means and count. Implements signal-core R6.9 */
  reset(): void {
    this.dotMeanMs = this.initialUnitMs;
    this.dashMeanMs = 3 * this.initialUnitMs;
    this.observed = 0;
  }
}
