import type { SignalEvent } from '../signal/signal-event';
import type { Token } from '../signal/types';
import { TAP_GRID, type TapCol } from './tap-alphabet';

/** Implements signal-core R8 */
export interface TapDecoderConfig {
  /** Initial mean time between pulses within a group, in ms. Default: 200. */
  readonly knockIntervalMs?: number;
  /** Initial mean pause between row and column groups, in ms. Default: 600. */
  readonly groupPauseMs?: number;
  /** Initial mean pause between characters, in ms. Default: 1800. */
  readonly letterPauseMs?: number;
}

type TapState = 'IDLE' | 'IN_GROUP_1' | 'BETWEEN_GROUPS' | 'IN_GROUP_2' | 'AFTER_CHAR';

const ALPHA = 0.2;
const MIN_MEAN_MS = 100;
const MAX_MEAN_MS = 5000;
const HELP_PULSE_COUNT = 8;
const SEPARATION = 1.5;

function clamp(v: number): number {
  return Math.min(MAX_MEAN_MS, Math.max(MIN_MEAN_MS, v));
}

function isCol(n: number): n is TapCol {
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

/**
 * Decodes knock pulses into tap-code characters, commands and word gaps.
 * Timing thresholds adapt to the user via three EMA cluster means.
 * Time is supplied by the caller; the decoder never reads a clock.
 *
 * Implements signal-core R8.4, R8.5, R8.5a, R8.6, R8.6a, R8.7, R8.7a, R8.8
 */
export class TapDecoder {
  private knockIntervalMean: number;
  private groupPauseMean: number;
  private letterPauseMean: number;
  private interGroupThreshold = 0;
  private interLetterThreshold = 0;

  private state: TapState = 'IDLE';
  private group1Count = 0;
  private group2Count = 0;
  private lastPulseAt = -1;
  private spaceSentThisSilence = false;
  private cooldown = false;

  constructor(config: TapDecoderConfig = {}) {
    this.knockIntervalMean = clamp(config.knockIntervalMs ?? 200);
    this.groupPauseMean = clamp(config.groupPauseMs ?? 600);
    this.letterPauseMean = clamp(config.letterPauseMs ?? 1800);
    this.recompute();
  }

  /**
   * Consumes one signal event. Only `'pulse'` events from the `'knock'`
   * source are handled; everything else is ignored.
   *
   * Implements signal-core R8.4, R8.5, R8.5a, R8.6, R8.7
   */
  feed(event: SignalEvent): Token[] {
    if (event.type !== 'pulse' || event.source !== 'knock') return [];
    const t = event.t;

    if (this.cooldown) {
      if (this.lastPulseAt >= 0 && t - this.lastPulseAt < this.interGroupThreshold) {
        this.lastPulseAt = t;
        return [];
      }
      this.cooldown = false;
      this.lastPulseAt = -1;
    }

    if (this.lastPulseAt < 0) {
      this.startCharacter(t);
      return [];
    }

    const elapsed = t - this.lastPulseAt;
    const tokens: Token[] = [];

    if (this.state === 'IDLE') {
      // Previous character was already flushed by tick().
      if (elapsed >= this.interLetterThreshold && elapsed < 2 * this.interLetterThreshold) {
        this.learn(elapsed);
      }
      this.maybeSpace(elapsed, tokens);
      this.startCharacter(t);
      return tokens;
    }

    if (elapsed < this.interGroupThreshold) {
      this.learn(elapsed);
      const count = this.groupIndex() === 1 ? ++this.group1Count : ++this.group2Count;
      if (this.state === 'BETWEEN_GROUPS') this.state = 'IN_GROUP_1';
      if (this.state === 'AFTER_CHAR') this.state = 'IN_GROUP_2';
      this.lastPulseAt = t;
      if (count >= HELP_PULSE_COUNT) {
        this.resetCharacter();
        this.cooldown = true;
        this.spaceSentThisSilence = true;
        return [{ kind: 'command', name: 'HELP' }];
      }
      return [];
    }

    if (elapsed < this.interLetterThreshold) {
      this.learn(elapsed);
      if (this.groupIndex() === 1) {
        this.state = 'IN_GROUP_2';
        this.group2Count = 1;
      } else {
        // A third group cannot form a valid character.
        tokens.push({ kind: 'unknown' });
        this.resetCharacter();
        this.startCharacter(t);
        return tokens;
      }
      this.lastPulseAt = t;
      return tokens;
    }

    // Inter-letter pause elapsed before this pulse.
    if (elapsed < 2 * this.interLetterThreshold) this.learn(elapsed);
    tokens.push(this.flush());
    this.maybeSpace(elapsed, tokens);
    this.startCharacter(t);
    return tokens;
  }

  /**
   * Advances the decoder clock; flushes a pending character after an
   * inter-letter pause and emits one space per word-gap silence.
   *
   * Implements signal-core R8.5, R8.6, R8.6a, R8.7a, R8.8
   */
  tick(nowMs: number): Token[] {
    if (this.lastPulseAt < 0) return [];
    const elapsed = nowMs - this.lastPulseAt;

    if (this.cooldown) {
      if (elapsed >= this.interGroupThreshold) {
        this.cooldown = false;
        this.lastPulseAt = -1;
      }
      return [];
    }

    const tokens: Token[] = [];
    if (this.state !== 'IDLE') {
      if (elapsed >= this.interLetterThreshold) {
        tokens.push(this.flush());
      } else {
        if (elapsed >= this.interGroupThreshold) {
          if (this.state === 'IN_GROUP_1') this.state = 'BETWEEN_GROUPS';
          else if (this.state === 'IN_GROUP_2') this.state = 'AFTER_CHAR';
        }
        return tokens;
      }
    }
    this.maybeSpace(elapsed, tokens);
    return tokens;
  }

  private maybeSpace(elapsed: number, tokens: Token[]): void {
    if (elapsed >= 2 * this.interLetterThreshold && !this.spaceSentThisSilence) {
      this.spaceSentThisSilence = true;
      tokens.push({ kind: 'space' });
    }
  }

  private groupIndex(): 1 | 2 {
    return this.state === 'IN_GROUP_1' || this.state === 'BETWEEN_GROUPS' ? 1 : 2;
  }

  private startCharacter(t: number): void {
    this.group1Count = 1;
    this.group2Count = 0;
    this.state = 'IN_GROUP_1';
    this.lastPulseAt = t;
    this.spaceSentThisSilence = false;
  }

  private resetCharacter(): void {
    this.group1Count = 0;
    this.group2Count = 0;
    this.state = 'IDLE';
  }

  private flush(): Token {
    const r = this.group1Count;
    const c = this.group2Count;
    let token: Token = { kind: 'unknown' };
    if (isCol(c)) {
      if (r >= 1 && r <= 5) {
        token = { kind: 'char', value: TAP_GRID[r as 1 | 2 | 3 | 4 | 5][c] };
      } else if (r === 6) {
        token = { kind: 'command', name: TAP_GRID[6][c] };
      }
    }
    this.resetCharacter();
    return token;
  }

  /** Updates the EMA cluster that `d` falls into, then re-derives thresholds. */
  private learn(d: number): void {
    if (d < this.interGroupThreshold) {
      this.knockIntervalMean = clamp(ALPHA * d + (1 - ALPHA) * this.knockIntervalMean);
    } else if (d < this.interLetterThreshold) {
      this.groupPauseMean = clamp(ALPHA * d + (1 - ALPHA) * this.groupPauseMean);
    } else {
      this.letterPauseMean = clamp(ALPHA * d + (1 - ALPHA) * this.letterPauseMean);
    }
    this.recompute();
  }

  private recompute(): void {
    this.groupPauseMean = Math.max(this.groupPauseMean, SEPARATION * this.knockIntervalMean);
    this.letterPauseMean = Math.max(this.letterPauseMean, SEPARATION * this.groupPauseMean);
    this.interGroupThreshold = (this.knockIntervalMean + this.groupPauseMean) / 2;
    this.interLetterThreshold = (this.groupPauseMean + this.letterPauseMean) / 2;
  }
}
