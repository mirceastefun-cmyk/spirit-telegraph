import type { ComposerEvent, Token } from '@/core/signal/types';

export type { ComposerEvent };

/** Maximum number of characters the buffer may hold. Implements signal-core R10 */
export const MAX_BUFFER_LENGTH = 10000;

/**
 * Pure text buffer that applies decoded tokens and returns structured events.
 * Implements signal-core R10
 */
export class Composer {
  private text = '';

  /** Current buffer contents. Implements signal-core R10.12 */
  get buffer(): string {
    return this.text;
  }

  /**
   * Applies one token to the buffer and returns the resulting events.
   * Implements signal-core R10
   */
  apply(token: Token): ComposerEvent[] {
    switch (token.kind) {
      case 'char':
        if (this.text.length >= MAX_BUFFER_LENGTH) return [];
        this.text += token.value;
        return [{ type: 'letter-added', char: token.value, buffer: this.text }];
      case 'space':
        return this.appendSpace();
      case 'unknown':
        return [{ type: 'unknown-symbol' }];
      case 'answer':
        return [];
      case 'command':
        switch (token.name) {
          case 'SPACE':
            return this.appendSpace();
          case 'BACKSPACE':
            if (this.text.length === 0) return [];
            this.text = this.text.slice(0, -1);
            return [{ type: 'letter-removed', buffer: this.text }];
          case 'CLEAR':
            return [{ type: 'clear-requested', text: this.text }];
          case 'SPEAK':
            return [{ type: 'speak-requested', text: this.text }];
          case 'HELP':
            return [{ type: 'help-requested' }];
          case 'ACCEPT_SUGGESTION':
            return [{ type: 'suggestion-accept' }];
          case 'NEXT_SUGGESTION':
            return [{ type: 'suggestion-next' }];
        }
    }
  }

  /** Empties the buffer after the user confirms a CLEAR. Implements signal-core R10.7a */
  confirmClear(): void {
    this.text = '';
  }

  /** Empties the buffer (test use). Implements signal-core R10.13 */
  reset(): void {
    this.text = '';
  }

  private appendSpace(): ComposerEvent[] {
    if (this.text.length === 0 || this.text.endsWith(' ')) return [];
    const word = this.text.slice(this.text.lastIndexOf(' ') + 1);
    this.text += ' ';
    return [{ type: 'word-completed', word, buffer: this.text }];
  }
}
