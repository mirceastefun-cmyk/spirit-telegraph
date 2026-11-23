import { describe, expect, it } from 'vitest';
import { decodeTimeline, type SignalEvent } from '../signal/signal-event';
import type { Token } from '../signal/types';
import { TapDecoder } from './tap-decoder';

const KI = 200;
const GP = 600;
const LP = 1800;
/** Final silence long enough to flush a character but shorter than a word gap. */
const FLUSH_GAP = 1500;

/** Builds pulses for the given groups starting at `start`; returns events and end time. */
function groups(counts: number[], start = 0): { events: SignalEvent[]; end: number } {
  const events: SignalEvent[] = [];
  let t = start;
  counts.forEach((n, gi) => {
    if (gi > 0) t += GP;
    for (let i = 0; i < n; i++) {
      if (i > 0) t += KI;
      events.push({ type: 'pulse', t, source: 'knock', channel: 0 });
    }
  });
  return { events, end: t };
}

function decode(counts: number[]): Token[] {
  const { events } = groups(counts);
  return decodeTimeline(new TapDecoder(), events, FLUSH_GAP);
}

describe('TapDecoder', () => {
  it('decodes (1,1) as A', () => {
    expect(decode([1, 1])).toEqual([{ kind: 'char', value: 'A' }]);
  });

  it('decodes (5,5) as Z', () => {
    expect(decode([5, 5])).toEqual([{ kind: 'char', value: 'Z' }]);
  });

  it('decodes (1,3) as C', () => {
    expect(decode([1, 3])).toEqual([{ kind: 'char', value: 'C' }]);
  });

  it('decodes row 6 col 1 as SPACE command', () => {
    expect(decode([6, 1])).toEqual([{ kind: 'command', name: 'SPACE' }]);
  });

  it('decodes row 6 col 5 as NEXT_SUGGESTION command', () => {
    expect(decode([6, 5])).toEqual([{ kind: 'command', name: 'NEXT_SUGGESTION' }]);
  });

  it('emits unknown for row 7', () => {
    expect(decode([7, 1])).toEqual([{ kind: 'unknown' }]);
  });

  it('emits unknown when only one group was received', () => {
    expect(decode([3])).toEqual([{ kind: 'unknown' }]);
  });

  it('decodes two consecutive characters', () => {
    const a = groups([1, 1]);
    const b = groups([2, 2], a.end + LP);
    const tokens = decodeTimeline(new TapDecoder(), [...a.events, ...b.events], FLUSH_GAP);
    expect(tokens).toEqual([
      { kind: 'char', value: 'A' },
      { kind: 'char', value: 'G' },
    ]);
  });

  it('ignores non-pulse and non-knock events', () => {
    const d = new TapDecoder();
    expect(d.feed({ type: 'down', t: 0, source: 'knock', channel: 0 })).toEqual([]);
    expect(d.feed({ type: 'pulse', t: 0, source: 'switch', channel: 0 })).toEqual([]);
    expect(d.tick(10000)).toEqual([]);
  });

  describe('HELP burst', () => {
    it('emits HELP on the 8th pulse and ignores pulses during cooldown', () => {
      const d = new TapDecoder();
      const out: Token[] = [];
      for (let i = 0; i < 10; i++) {
        out.push(...d.feed({ type: 'pulse', t: i * KI, source: 'knock', channel: 0 }));
      }
      expect(out).toEqual([{ kind: 'command', name: 'HELP' }]);
      // Nothing pending after the burst, even after a long silence.
      expect(d.tick(9 * KI + 10000)).toEqual([]);
    });

    it('decodes normally after the cooldown silence', () => {
      const d = new TapDecoder();
      for (let i = 0; i < 8; i++) d.feed({ type: 'pulse', t: i * KI, source: 'knock', channel: 0 });
      const { events } = groups([1, 1], 7 * KI + 5000);
      expect(decodeTimeline(d, events, FLUSH_GAP)).toEqual([{ kind: 'char', value: 'A' }]);
    });
  });

  describe('word gap', () => {
    it('emits exactly one space for a long silence across repeated ticks', () => {
      const d = new TapDecoder();
      const { events, end } = groups([1, 1]);
      for (const e of events) d.feed(e);
      const out: Token[] = [];
      for (let k = 1; k <= 10; k++) out.push(...d.tick(end + k * LP));
      expect(out).toEqual([
        { kind: 'char', value: 'A' },
        { kind: 'space' },
      ]);
    });

    it('emits one space between words in a timeline', () => {
      const a = groups([1, 1]);
      const b = groups([1, 2], a.end + LP * 3.5);
      const tokens = decodeTimeline(new TapDecoder(), [...a.events, ...b.events], FLUSH_GAP);
      expect(tokens).toEqual([
        { kind: 'char', value: 'A' },
        { kind: 'space' },
        { kind: 'char', value: 'B' },
      ]);
    });
  });
});
