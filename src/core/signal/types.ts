/**
 * Shared token and event types for the signal-core module.
 * Implements signal-core R1 (Glossary), R6, R10
 */

/** Implements signal-core R1 (Glossary) */
export type CommandName =
  | 'SPACE'
  | 'BACKSPACE'
  | 'SPEAK'
  | 'CLEAR'
  | 'ACCEPT_SUGGESTION'
  | 'NEXT_SUGGESTION'
  | 'HELP';

export type CharToken = { readonly kind: 'char'; readonly value: string };
export type SpaceToken = { readonly kind: 'space' };
export type CommandToken = { readonly kind: 'command'; readonly name: CommandName };
export type UnknownToken = { readonly kind: 'unknown' };
export type AnswerToken = { readonly kind: 'answer'; readonly value: 'yes' | 'no' };

/** Implements signal-core R1 (Token discriminated union) */
export type Token = CharToken | SpaceToken | CommandToken | UnknownToken | AnswerToken;

/** Implements signal-core R10 */
export type ComposerEvent =
  | { readonly type: 'letter-added'; readonly char: string; readonly buffer: string }
  | { readonly type: 'word-completed'; readonly word: string; readonly buffer: string }
  | { readonly type: 'letter-removed'; readonly buffer: string }
  | { readonly type: 'clear-requested'; readonly text: string }
  | { readonly type: 'speak-requested'; readonly text: string }
  | { readonly type: 'help-requested' }
  | { readonly type: 'suggestion-accept' }
  | { readonly type: 'suggestion-next' }
  | { readonly type: 'unknown-symbol' };

/** Implements signal-core R6 */
export interface Thresholds {
  /** Geometric-mean boundary between dot and dash durations, in ms. */
  readonly dotDashThreshold: number;
  /** Minimum silence to flush a symbol, in ms. */
  readonly letterGapMin: number;
  /** Minimum silence to auto-emit a space token, in ms. */
  readonly wordGapMin: number;
  /** Minimum press duration to treat as a HELP long-hold, in ms. */
  readonly longHoldMs: number;
}
