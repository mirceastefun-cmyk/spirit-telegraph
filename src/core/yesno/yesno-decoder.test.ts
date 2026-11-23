import { describe, expect, it } from 'vitest';
import type { SignalEvent, SignalSource } from '../signal/signal-event';
import { YesNoDecoder } from './yesno-decoder';

const ev = (
  type: SignalEvent['type'],
  t: number,
  source: SignalSource = 'knock',
): SignalEvent => ({ type, t, source, channel: 0 });

describe('YesNoDecoder', () => {
  it('single down then settle → yes', () => {
    const d = new YesNoDecoder({ settleMs: 1000 });
    d.feed(ev('down', 0));
    expect(d.tick(999)).toBeNull();
    expect(d.tick(1000)).toEqual({ kind: 'answer', value: 'yes' });
  });

  it('two downs then settle → no', () => {
    const d = new YesNoDecoder({ settleMs: 1000 });
    d.feed(ev('down', 0));
    d.feed(ev('pulse', 400));
    expect(d.tick(1399)).toBeNull();
    expect(d.tick(1400)).toEqual({ kind: 'answer', value: 'no' });
  });

  it('zero signals → null', () => {
    expect(new YesNoDecoder().tick(100000)).toBeNull();
  });

  it('three signals → null', () => {
    const d = new YesNoDecoder({ settleMs: 500 });
    d.feed(ev('down', 0));
    d.feed(ev('down', 100));
    d.feed(ev('down', 200));
    expect(d.tick(10000)).toBeNull();
  });

  it('ignores events from a non-matching source', () => {
    const d = new YesNoDecoder({ settleMs: 500, source: 'knock' });
    d.feed(ev('down', 0, 'switch'));
    expect(d.tick(5000)).toBeNull();
    d.feed(ev('pulse', 6000, 'knock'));
    d.feed(ev('down', 6100, 'blink'));
    expect(d.tick(6600)).toEqual({ kind: 'answer', value: 'yes' });
  });

  it('returns null after settling until a new signal arrives', () => {
    const d = new YesNoDecoder({ settleMs: 500 });
    d.feed(ev('down', 0));
    expect(d.tick(500)).not.toBeNull();
    expect(d.tick(501)).toBeNull();
    expect(d.tick(9000)).toBeNull();
    d.feed(ev('down', 10000));
    expect(d.tick(10500)).toEqual({ kind: 'answer', value: 'yes' });
  });

  it('throws RangeError for out-of-range settleMs', () => {
    expect(() => new YesNoDecoder({ settleMs: 499 })).toThrow(RangeError);
    expect(() => new YesNoDecoder({ settleMs: 10001 })).toThrow(
      'settleMs must be in [500, 10000]',
    );
    expect(() => new YesNoDecoder({ settleMs: Number.NaN })).toThrow(RangeError);
    expect(() => new YesNoDecoder({ settleMs: 500 })).not.toThrow();
    expect(() => new YesNoDecoder({ settleMs: 10000 })).not.toThrow();
  });

  it('does not count up events', () => {
    const d = new YesNoDecoder({ settleMs: 500 });
    d.feed(ev('down', 0));
    d.feed(ev('up', 100));
    expect(d.tick(600)).toEqual({ kind: 'answer', value: 'yes' });
  });
});
