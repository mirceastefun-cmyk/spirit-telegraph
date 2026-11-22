import { COMMAND_TABLE } from '@/core/commands/command-table';
import type { SignalEvent } from '@/core/signal/signal-event';
import type { Thresholds, Token } from '@/core/signal/types';
import { AdaptiveTiming } from './adaptive-timing';
import { MORSE_ALPHABET } from './morse-alphabet';

/** Implements signal-core R4, R5 */
export interface MorseDecoderConfig {
  /** 'one-switch' classifies press duration; 'two-switch' uses channel. Default: 'one-switch'. */
  readonly mode?: 'one-switch' | 'two-switch';
  /** Channel index mapped to dot in two-switch mode. Default: 0. */
  readonly dotChannel?: 0 | 1;
  /** Channel index mapped to dash in two-switch mode. Default: 1. */
  readonly dashChannel?: 0 | 1;
  /** Starting unit duration in ms, also used during warm-up. Range [40, 3000]. Default: 100. */
  readonly initialUnitMs?: number;
  /** Emit a space token automatically on word-gap silence. Default: true. */
  readonly autoWordGap?: boolean;
  /** Silence multiplier for letter gap. Range [1.5, 6.0]. Default: 1.75. */
  readonly letterGapFactor?: number;
  /** Silence multiplier for word gap. Range [3.0, 12.0]. Default: 4.5. */
  readonly wordGapFactor?: number;
  /** Number of presses before adaptive estimates are trusted. Range [2, 20]. Default: 6. */
  readonly warmUpCount?: number;
  /** EMA smoothing factor. Range [0.05, 0.5]. Default: 0.15. */
  readonly alpha?: number;
}

type MorseState = 'IDLE' | 'PRESSING' | 'AFTER_UP' | 'HELP_FIRED';

/**
 * Deterministic one-switch Morse decoder driven by `feed` and `tick`.
 * Two-switch mode is not yet implemented (signal-core task 12).
 *
 * Implements signal-core R4.1, R4.2, R4.3, R4.3a, R4.4, R4.5, R4.6, R4.7, R4.8, R4.9, R4.10,
 * R7.1, R7.3, R7.5
 */
export class MorseDecoder {
  private readonly timing: AdaptiveTiming;
  private readonly autoWordGap: boolean;

  private state: MorseState = 'IDLE';
  private symbolBuf = '';
  private downAt = -1;
  private lastUpAt = -1;
  private spaceSentThisSilence = false;

  constructor(config: MorseDecoderConfig = {}) {
    this.autoWordGap = config.autoWordGap ?? true;
    this.timing = new AdaptiveTiming({
      initialUnitMs: config.initialUnitMs ?? 100,
      ...(config.letterGapFactor !== undefined && { letterGapFactor: config.letterGapFactor }),
      ...(config.wordGapFactor !== undefined && { wordGapFactor: config.wordGapFactor }),
      ...(config.warmUpCount !== undefined && { warmUpCount: config.warmUpCount }),
      ...(config.alpha !== undefined && { alpha: config.alpha }),
    });
  }

  /** Current adaptive thresholds. Implements signal-core R4.10 */
  get thresholds(): Thresholds {
    return this.timing.thresholds;
  }

  /**
   * Consumes one signal event and returns any tokens it completes.
   * Implements signal-core R4.1, R4.2, R4.3, R4.3a, R4.8, R4.9
   */
  feed(event: SignalEvent): Token[] {
    if (event.type === 'down') return this.onDown(event.t);
    if (event.type === 'up') return this.onUp(event.t);
    return [];
  }

  /**
   * Advances the clock and returns any tokens that became due.
   * Implements signal-core R4.4, R4.5, R4.6, R4.7, R7.3
   */
  tick(nowMs: number): Token[] {
    if (this.state === 'PRESSING') {
      if (nowMs - this.downAt >= this.timing.thresholds.longHoldMs) {
        this.symbolBuf = '';
        this.state = 'HELP_FIRED';
        return [{ kind: 'command', name: 'HELP' }];
      }
      return [];
    }
    if (this.state === 'AFTER_UP') return this.flushForSilence(nowMs - this.lastUpAt);
    return [];
  }

  private onDown(t: number): Token[] {
    const tokens = this.state === 'AFTER_UP' ? this.flushForSilence(t - this.lastUpAt) : [];
    this.downAt = t;
    this.state = 'PRESSING';
    return tokens;
  }

  private onUp(t: number): Token[] {
    if (this.state === 'HELP_FIRED') {
      this.state = 'IDLE';
      this.downAt = -1;
      return [];
    }
    if (this.state !== 'PRESSING') return [];

    const duration = t - this.downAt;
    this.timing.observe(duration);
    this.symbolBuf += duration < this.timing.thresholds.dotDashThreshold ? '.' : '-';
    this.lastUpAt = t;
    this.downAt = -1;
    this.spaceSentThisSilence = false;
    this.state = 'AFTER_UP';
    return [];
  }

  /** Flushes the pending symbol and word-gap space according to the silence length. */
  private flushForSilence(silence: number): Token[] {
    const { letterGapMin, wordGapMin } = this.timing.thresholds;
    const tokens: Token[] = [];
    if (silence < letterGapMin) return tokens;

    if (this.symbolBuf !== '') tokens.push(this.flushSymbol());
    if (silence >= wordGapMin && this.autoWordGap && !this.spaceSentThisSilence) {
      tokens.push({ kind: 'space' });
      this.spaceSentThisSilence = true;
    }
    return tokens;
  }

  /** Command table first, then alphabet, then unknown. Implements signal-core R7.1, R7.5 */
  private flushSymbol(): Token {
    const pattern = this.symbolBuf;
    this.symbolBuf = '';

    const name = COMMAND_TABLE.get(pattern);
    if (name !== undefined) return { kind: 'command', name };

    for (const [char, p] of MORSE_ALPHABET) {
      if (p === pattern) return { kind: 'char', value: char.toUpperCase() };
    }
    return { kind: 'unknown' };
  }
}
