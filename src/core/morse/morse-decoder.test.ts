import { describe, expect, it } from 'vitest';
import { buildTimeline, type SignalEvent } from '@/core/signal/signal-event';
import type { Token } from '@/core/signal/types';
import { MorseDecoder } from './morse-decoder';

const down = (t: number): SignalEvent => ({ type: 'down', t, source: 'switch', channel: 0 });
const up = (t: number): SignalEvent => ({ type: 'up', t, source: 'switch', channel: 0 });

/** Presses starting at `start` with the given durations, 100 ms apart. Returns last up time. */
function press(d: MorseDecoder, start: number, durations: number[]): { tokens: Token[]; end: number } {
  const tokens: Token[] = [];
  let t = start;
  for (const dur of durations) {
    tokens.push(...d.feed(down(t)));
    t += dur;
    tokens.push(...d.feed(up(t)));
    t += 100;
  }
  return { tokens, end: t - 100 };
}

// initialUnitMs 100: dotDash ~173, letterGapMin 175, wordGapMin 450, longHold 3000.
const make = (autoWordGap = true): MorseDecoder => new MorseDecoder({ initialUnitMs: 100, autoWordGap });

describe('MorseDecoder (one-switch)', () => {
  it('decodes a single dot to E', () => {
    const d = make();
    const { end } = press(d, 0, [100]);
    expect(d.tick(end + 175)).toEqual([{ kind: 'char', value: 'E' }]);
  });

  it('decodes a single dash to T', () => {
    const d = make();
    const { end } = press(d, 0, [300]);
    expect(d.tick(end + 175)).toEqual([{ kind: 'char', value: 'T' }]);
  });

  it('decodes dot-dash to A', () => {
    const d = make();
    const { end } = press(d, 0, [100, 300]);
    expect(d.tick(end + 200)).toEqual([{ kind: 'char', value: 'A' }]);
  });

  it('does not flush before the letter gap', () => {
    const d = make();
    const { end } = press(d, 0, [100]);
    expect(d.tick(end + 174)).toEqual([]);
  });

  it('emits a space on tick at the word gap, after the char', () => {
    const d = make();
    const { end } = press(d, 0, [100]);
    expect(d.tick(end + 450)).toEqual([{ kind: 'char', value: 'E' }, { kind: 'space' }]);
  });

  it('emits a space at the word gap even if the letter was flushed earlier', () => {
    const d = make();
    const { end } = press(d, 0, [100]);
    expect(d.tick(end + 200)).toEqual([{ kind: 'char', value: 'E' }]);
    expect(d.tick(end + 500)).toEqual([{ kind: 'space' }]);
  });

  it('dedups the word-gap space across ticks', () => {
    const d = make();
    const { end } = press(d, 0, [100]);
    const all = [...d.tick(end + 450), ...d.tick(end + 600), ...d.tick(end + 5000)];
    expect(all.filter((x) => x.kind === 'space')).toHaveLength(1);
  });

  it('autoWordGap: false suppresses the space', () => {
    const d = make(false);
    const { end } = press(d, 0, [100]);
    expect(d.tick(end + 5000)).toEqual([{ kind: 'char', value: 'E' }]);
  });

  it('flushes on the next press without tick (EE, not I)', () => {
    const d = make();
    const first = press(d, 0, [100]);
    const second = press(d, first.end + 200, [100]);
    expect(second.tokens).toEqual([{ kind: 'char', value: 'E' }]);
    expect(d.tick(second.end + 200)).toEqual([{ kind: 'char', value: 'E' }]);
  });

  it('keeps accumulating when the next press comes before the letter gap', () => {
    const d = make();
    const first = press(d, 0, [100]);
    const second = press(d, first.end + 100, [100]);
    expect(second.tokens).toEqual([]);
    expect(d.tick(second.end + 200)).toEqual([{ kind: 'char', value: 'I' }]);
  });

  it('emits a space on the next press after a word gap', () => {
    const d = make();
    const first = press(d, 0, [100]);
    const second = press(d, first.end + 500, [100]);
    expect(second.tokens).toEqual([{ kind: 'char', value: 'E' }, { kind: 'space' }]);
  });

  it('emits HELP on long hold and ignores the ending up', () => {
    const d = make();
    d.feed(down(0));
    expect(d.tick(2999)).toEqual([]);
    expect(d.tick(3000)).toEqual([{ kind: 'command', name: 'HELP' }]);
    expect(d.tick(3500)).toEqual([]);
    expect(d.feed(up(4000))).toEqual([]);
    expect(d.tick(9000)).toEqual([]);
  });

  it('appends no dot/dash after HELP', () => {
    const d = make();
    d.feed(down(0));
    d.tick(3000);
    d.feed(up(3500));
    const { end } = press(d, 5000, [100]);
    expect(d.tick(end + 175)).toEqual([{ kind: 'char', value: 'E' }]);
  });

  it('returns [] for an orphan up', () => {
    const d = make();
    expect(d.feed(up(50))).toEqual([]);
    expect(d.tick(5000)).toEqual([]);
  });

  it('decodes ..-- as the SPACE command', () => {
    const d = make();
    const { end } = press(d, 0, [100, 100, 300, 300]);
    expect(d.tick(end + 175)).toEqual([{ kind: 'command', name: 'SPACE' }]);
  });

  it('emits unknown for a pattern in neither table', () => {
    const d = make();
    const { end } = press(d, 0, [100, 100, 100, 100, 100, 100]);
    expect(d.tick(end + 175)).toEqual([{ kind: 'unknown' }]);
  });

  it('exposes thresholds from AdaptiveTiming', () => {
    const t = make().thresholds;
    expect(t.letterGapMin).toBe(175);
    expect(t.wordGapMin).toBe(450);
    expect(t.longHoldMs).toBe(3000);
    expect(t.dotDashThreshold).toBeCloseTo(Math.sqrt(100 * 300));
  });

  it('works with buildTimeline events', () => {
    const d = make();
    const events = buildTimeline([
      { type: 'down', dt: 0, source: 'switch' },
      { type: 'up', dt: 100, source: 'switch' },
    ]);
    const out = events.flatMap((e) => d.feed(e));
    expect(out).toEqual([]);
    expect(d.tick(1000)).toEqual([{ kind: 'char', value: 'E' }, { kind: 'space' }]);
  });
});

const pulse = (t: number, channel: 0 | 1): SignalEvent => ({ type: 'pulse', t, source: 'switch', channel });
const chDown = (t: number, channel: 0 | 1): SignalEvent => ({ type: 'down', t, source: 'switch', channel });
const chUp = (t: number, channel: 0 | 1): SignalEvent => ({ type: 'up', t, source: 'switch', channel });
const makeTwo = (): MorseDecoder => new MorseDecoder({ mode: 'two-switch', initialUnitMs: 100 });

describe('MorseDecoder (two-switch)', () => {
  it('throws when dotChannel equals dashChannel', () => {
    expect(() => new MorseDecoder({ mode: 'two-switch', dotChannel: 1, dashChannel: 1 })).toThrow(
      new RangeError('dotChannel and dashChannel must differ'),
    );
  });

  it('maps a pulse on dotChannel to a dot', () => {
    const d = makeTwo();
    expect(d.feed(pulse(0, 0))).toEqual([]);
    expect(d.tick(175)).toEqual([{ kind: 'char', value: 'E' }]);
  });

  it('maps a pulse on dashChannel to a dash', () => {
    const d = makeTwo();
    d.feed(pulse(0, 1));
    expect(d.tick(175)).toEqual([{ kind: 'char', value: 'T' }]);
  });

  it('maps down/up pairs by channel regardless of duration', () => {
    const d = makeTwo();
    d.feed(chDown(0, 0));
    d.feed(chUp(1000, 0));
    d.feed(pulse(1100, 1));
    expect(d.tick(1275)).toEqual([{ kind: 'char', value: 'A' }]);
  });

  it('honours custom channel mapping', () => {
    const d = new MorseDecoder({ mode: 'two-switch', dotChannel: 1, dashChannel: 0 });
    d.feed(pulse(0, 1));
    d.feed(pulse(100, 0));
    expect(d.tick(275)).toEqual([{ kind: 'char', value: 'A' }]);
  });

  it('ignores events on an unrecognised channel', () => {
    const d = new MorseDecoder({ mode: 'two-switch', dotChannel: 0, dashChannel: 1 });
    const odd = { type: 'pulse', t: 0, source: 'switch', channel: 2 } as unknown as SignalEvent;
    expect(d.feed(odd)).toEqual([]);
    expect(d.tick(10000)).toEqual([]);
  });

  it('flushes the pending letter when the next pulse arrives after the letter gap', () => {
    const d = makeTwo();
    d.feed(pulse(0, 0));
    expect(d.feed(pulse(200, 0))).toEqual([{ kind: 'char', value: 'E' }]);
    expect(d.tick(500)).toEqual([{ kind: 'char', value: 'E' }]);
  });

  it('emits a space at the word gap', () => {
    const d = makeTwo();
    d.feed(pulse(0, 0));
    expect(d.feed(pulse(500, 1))).toEqual([{ kind: 'char', value: 'E' }, { kind: 'space' }]);
  });

  it('ignores a second down on the other channel while the first press is active', () => {
    const d = makeTwo();
    d.feed(chDown(0, 0));
    expect(d.feed(chDown(50, 1))).toEqual([]);
    d.feed(chUp(100, 1));
    d.feed(chUp(150, 0));
    expect(d.tick(325)).toEqual([{ kind: 'char', value: 'E' }]);
  });

  it('never fires HELP from a long press in two-switch mode', () => {
    const d = makeTwo();
    d.feed(chDown(0, 1));
    expect(d.tick(10000)).toEqual([]);
  });
});
