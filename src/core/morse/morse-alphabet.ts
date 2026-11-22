/** Raw International Morse table. Keys are lowercase single characters. */
const ENTRIES: readonly (readonly [string, string])[] = [
  ['a', '.-'],
  ['b', '-...'],
  ['c', '-.-.'],
  ['d', '-..'],
  ['e', '.'],
  ['f', '..-.'],
  ['g', '--.'],
  ['h', '....'],
  ['i', '..'],
  ['j', '.---'],
  ['k', '-.-'],
  ['l', '.-..'],
  ['m', '--'],
  ['n', '-.'],
  ['o', '---'],
  ['p', '.--.'],
  ['q', '--.-'],
  ['r', '.-.'],
  ['s', '...'],
  ['t', '-'],
  ['u', '..-'],
  ['v', '...-'],
  ['w', '.--'],
  ['x', '-..-'],
  ['y', '-.--'],
  ['z', '--..'],
  ['0', '-----'],
  ['1', '.----'],
  ['2', '..---'],
  ['3', '...--'],
  ['4', '....-'],
  ['5', '.....'],
  ['6', '-....'],
  ['7', '--...'],
  ['8', '---..'],
  ['9', '----.'],
  ['.', '.-.-.-'],
  [',', '--..--'],
  ['?', '..--..'],
  ['!', '-.-.--'],
  ['/', '-..-.'],
  ["'", '.----.'],
  ['-', '-....-'],
  ['(', '-.--.'],
  [')', '-.--.-'],
  [':', '---...'],
  ['=', '-...-'],
  ['@', '.--.-.'],
];

/** Map whose mutators are inert, so the stored patterns can never change. */
class FrozenMap extends Map<string, string> {
  constructor(entries: readonly (readonly [string, string])[]) {
    super();
    for (const [k, v] of entries) Map.prototype.set.call(this, k, v);
  }
  override set(): this {
    return this;
  }
  override delete(): boolean {
    return false;
  }
  override clear(): void {
    // no-op
  }
}

/**
 * Canonical International Morse lookup: 26 letters, 10 digits and 12
 * punctuation marks (`. , ? ! / ' - ( ) : = @`), 48 entries. `+` is absent.
 * Backed by a Map, so lookup is O(1); mutation attempts have no effect.
 *
 * Implements signal-core R2.1, R2.4, R2.5
 */
export const MORSE_ALPHABET: ReadonlyMap<string, string> = Object.freeze(
  new FrozenMap(ENTRIES),
);

/**
 * Returns the dot-dash pattern for a character (case-insensitive), or
 * `undefined` if the character is not in the alphabet. Never throws.
 *
 * Implements signal-core R2.2, R2.3
 */
export function morsePattern(char: string): string | undefined {
  return MORSE_ALPHABET.get(char.toLowerCase());
}
