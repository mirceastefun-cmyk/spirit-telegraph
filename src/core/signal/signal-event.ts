/**
 * The single signal type that every sensor emits.
 * Implements signal-core R1.1
 */
export type SignalSource = 'switch' | 'blink' | 'knock';

export type SignalEvent =
  | { type: 'down'; t: number; source: SignalSource }
  | { type: 'up'; t: number; source: SignalSource }
  | { type: 'pulse'; t: number; source: SignalSource };
