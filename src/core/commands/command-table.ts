/**
 * Frozen lookup map from Morse dot-dash pattern to CommandName.
 * Implements signal-core P5 (command patterns must not collide with alphabet patterns).
 */

import type { CommandName } from '@/core/signal/types';

/**
 * Maps a Morse dot-dash pattern to its CommandName.
 * The Command_Table is checked before the Morse alphabet on every symbol flush.
 * Implements signal-core P5.
 */
export const COMMAND_TABLE: ReadonlyMap<string, CommandName> = Object.freeze(
  new Map<string, CommandName>([
    ['..--',     'SPACE'],
    ['----',     'BACKSPACE'],
    ['.-.-',     'ACCEPT_SUGGESTION'],
    ['---.',     'NEXT_SUGGESTION'],
    ['.-.-.',    'SPEAK'],
    ['........', 'CLEAR'],
    ['...---...','HELP'],
  ])
);
