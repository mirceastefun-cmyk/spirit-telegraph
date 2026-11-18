import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { SignalEvent, SignalSource } from './signal-event';

describe('SignalEvent', () => {
  it('round-trips through JSON for any valid event (property)', () => {
    const sourceArb = fc.constantFrom<SignalSource>('switch', 'blink', 'knock');
    const typeArb = fc.constantFrom<'down' | 'up' | 'pulse'>('down', 'up', 'pulse');

    fc.assert(
      fc.property(typeArb, fc.nat(), sourceArb, (type, t, source) => {
        const event: SignalEvent = { type, t, source };
        const roundTripped = JSON.parse(JSON.stringify(event)) as SignalEvent;
        expect(roundTripped.type).toBe(type);
        expect(roundTripped.t).toBe(t);
        expect(roundTripped.source).toBe(source);
      }),
      { numRuns: 200 },
    );
  });
});
