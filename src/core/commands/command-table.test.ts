/**
 * Exhaustive deterministic unit test for P5:
 * No command pattern collides with any Morse alphabet pattern,
 * and all command patterns are mutually distinct.
 *
 * Implements signal-core P5.
 */

import { describe, it, expect } from 'vitest';
import { COMMAND_TABLE } from './command-table';

/**
 * The 48 standard International Morse Code patterns (A–Z, 0–9, 12 punctuation marks).
 * Stubbed inline because morse-alphabet.ts is not yet implemented (Task 5).
 */
const MORSE_ALPHABET: ReadonlyMap<string, string> = new Map<string, string>([
  // Letters A–Z
  ['A', '.-'],
  ['B', '-...'],
  ['C', '-.-.'],
  ['D', '-..'],
  ['E', '.'],
  ['F', '..-.'],
  ['G', '--.'],
  ['H', '....'],
  ['I', '..'],
  ['J', '.---'],
  ['K', '-.-'],
  ['L', '.-..'],
  ['M', '--'],
  ['N', '-.'],
  ['O', '---'],
  ['P', '.--.'],
  ['Q', '--.-'],
  ['R', '.-.'],
  ['S', '...'],
  ['T', '-'],
  ['U', '..-'],
  ['V', '...-'],
  ['W', '.--'],
  ['X', '-..-'],
  ['Y', '-.--'],
  ['Z', '--..'],
  // Digits 0–9
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
  // Punctuation (12 marks)
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
]);

describe('COMMAND_TABLE', () => {
  it('contains exactly 7 entries', () => {
    expect(COMMAND_TABLE.size).toBe(7);
  });

  it('P5: all 7 command patterns are mutually distinct', () => {
    const patterns = Array.from(COMMAND_TABLE.keys());
    const unique = new Set(patterns);
    expect(unique.size).toBe(patterns.length);
  });

  it('P5: no command pattern appears in the 48-entry Morse alphabet', () => {
    const alphabetPatterns = new Set(MORSE_ALPHABET.values());

    for (const [pattern, name] of COMMAND_TABLE) {
      expect(
        alphabetPatterns.has(pattern),
        `Command ${name} pattern "${pattern}" collides with an alphabet entry`,
      ).toBe(false);
    }
  });

  it('contains the correct pattern for each command', () => {
    expect(COMMAND_TABLE.get('..--..')).toBeUndefined();
    expect(COMMAND_TABLE.get('..--')).toBe('SPACE');
    expect(COMMAND_TABLE.get('----')).toBe('BACKSPACE');
    expect(COMMAND_TABLE.get('.-.-')).toBe('ACCEPT_SUGGESTION');
    expect(COMMAND_TABLE.get('---.')).toBe('NEXT_SUGGESTION');
    expect(COMMAND_TABLE.get('.-.-.')).toBe('SPEAK');
    expect(COMMAND_TABLE.get('........')).toBe('CLEAR');
    expect(COMMAND_TABLE.get('...---...')).toBe('HELP');
  });

  it('the alphabet stub contains exactly 48 entries', () => {
    expect(MORSE_ALPHABET.size).toBe(48);
  });

  it('P5: exhaustive cross-check — every command vs every alphabet pattern', () => {
    const commandPatterns = Array.from(COMMAND_TABLE.keys());
    const alphabetEntries = Array.from(MORSE_ALPHABET.entries());

    const collisions: string[] = [];

    for (const cmdPattern of commandPatterns) {
      for (const [char, alphaPattern] of alphabetEntries) {
        if (cmdPattern === alphaPattern) {
          const name = COMMAND_TABLE.get(cmdPattern);
          collisions.push(
            `Command ${name} ("${cmdPattern}") collides with alphabet entry for '${char}'`,
          );
        }
      }
    }

    expect(collisions).toEqual([]);
  });
});
