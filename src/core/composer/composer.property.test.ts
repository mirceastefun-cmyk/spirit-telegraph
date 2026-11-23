// Feature: signal-core, Property 8: Composer BACKSPACE/CLEAR round-trip
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { Composer, MAX_BUFFER_LENGTH } from './composer';

function seeded(initial: string): Composer {
  const composer = new Composer();
  for (const value of initial) {
    composer.apply({ kind: 'char', value });
  }
  return composer;
}

describe('Property 8: Composer BACKSPACE/CLEAR round-trip', () => {
  /** **Validates: Requirements 10** (implements R11.8) */
  it('BACKSPACE after inserting a char restores the previous buffer', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 9999 }),
        fc.char(),
        (initial, c) => {
          const composer = seeded(initial);
          const bufferBefore = composer.buffer;
          fc.pre(bufferBefore.length < MAX_BUFFER_LENGTH);
          composer.apply({ kind: 'char', value: c });
          composer.apply({ kind: 'command', name: 'BACKSPACE' });
          expect(composer.buffer).toBe(bufferBefore);
        },
      ),
      { numRuns: 100 },
    );
  });

  /** **Validates: Requirements 10** (implements R11.8) */
  it('confirmClear empties any buffer', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 9999 }), (initial) => {
        const composer = seeded(initial);
        composer.confirmClear();
        expect(composer.buffer).toBe('');
      }),
      { numRuns: 100 },
    );
  });
});
