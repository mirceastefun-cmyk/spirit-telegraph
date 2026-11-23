import type { CommandName } from '../signal/types';

/** Column index of the tap grid. */
export type TapCol = 1 | 2 | 3 | 4 | 5;
/** Row index of the tap grid (rows 1-5 letters, row 6 commands). */
export type TapRow = 1 | 2 | 3 | 4 | 5 | 6;

type LetterRow = Readonly<Record<TapCol, string>>;
type CommandRow = Readonly<Record<TapCol, CommandName>>;

export interface TapGrid {
  readonly 1: LetterRow;
  readonly 2: LetterRow;
  readonly 3: LetterRow;
  readonly 4: LetterRow;
  readonly 5: LetterRow;
  readonly 6: CommandRow;
}

function row<T>(a: T, b: T, c: T, d: T, e: T): Readonly<Record<TapCol, T>> {
  return Object.freeze({ 1: a, 2: b, 3: c, 4: d, 5: e });
}

/**
 * Extended 6x5 tap-code grid, indexed `TAP_GRID[row][col]`.
 * Rows 1-5 hold letters (K is omitted; callers normalise K to C).
 * Row 6 holds commands.
 *
 * Implements signal-core R8.1
 */
export const TAP_GRID: TapGrid = Object.freeze({
  1: row('A', 'B', 'C', 'D', 'E'),
  2: row('F', 'G', 'H', 'I', 'J'),
  3: row('L', 'M', 'N', 'O', 'P'),
  4: row('Q', 'R', 'S', 'T', 'U'),
  5: row('V', 'W', 'X', 'Y', 'Z'),
  6: row<CommandName>('SPACE', 'BACKSPACE', 'SPEAK', 'ACCEPT_SUGGESTION', 'NEXT_SUGGESTION'),
});

const LETTER_PATTERNS: ReadonlyMap<string, readonly [number, number]> = (() => {
  const map = new Map<string, readonly [number, number]>();
  const cols: readonly TapCol[] = [1, 2, 3, 4, 5];
  const rows = [1, 2, 3, 4, 5] as const;
  for (const r of rows) {
    for (const c of cols) {
      map.set(TAP_GRID[r][c], [r, c]);
    }
  }
  map.set('K', [1, 3]);
  return map;
})();

/**
 * Returns the `[row, col]` tap pattern for a letter (case-insensitive, K maps
 * to C), or `undefined` for anything else.
 *
 * Implements signal-core R8.1
 */
export function tapPattern(char: string): [number, number] | undefined {
  const found = LETTER_PATTERNS.get(char.toUpperCase());
  return found ? [found[0], found[1]] : undefined;
}
