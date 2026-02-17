// WhatsApp formatter — converts Markdown to WhatsApp-native formatting
// Also handles message splitting for the 4096-char limit

import config from './config.js';

export class WhatsAppFormatter {
  constructor(maxMessageLength = config.output.maxMessageLength) {
    this.maxLen = maxMessageLength;
  }

  /**
   * Add project tag prefix to a message.
   * Format: 📂 *projectName* | text
   */
  addProjectTag(text, projectName) {
    if (!text || !projectName) return text;

    // Split into lines and tag each one (for multi-line messages)
    const lines = text.split('\n');
    const tagged = lines.map(line => {
      // Empty lines don't get tagged
      if (!line.trim()) return line;
      return `📂 *${projectName}* | ${line}`;
    });

    return tagged.join('\n');
  }

  /**
   * Convert Markdown text to WhatsApp-formatted text.
   */
  format(text) {
    if (!text) return '';

    let result = text;

    // Process code blocks first (protect them from other transformations)
    const codeBlocks = [];
    result = result.replace(/```[\s\S]*?```/g, (match) => {
      const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
      codeBlocks.push(match); // Code blocks use same syntax in WhatsApp
      return placeholder;
    });

    // Protect inline code from other transformations
    const inlineCode = [];
    result = result.replace(/`[^`]+`/g, (match) => {
      const placeholder = `__INLINE_CODE_${inlineCode.length}__`;
      inlineCode.push(match); // Inline code uses same syntax
      return placeholder;
    });

    // Italic FIRST: *text* → _text_ (single asterisks only, not **)
    result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '_$1_');

    // Bold: **text** → *text* (WhatsApp bold)
    result = result.replace(/\*\*(.+?)\*\*/g, '*$1*');

    // Headers: ## Header → *Header* (WhatsApp bold)
    result = result.replace(/^#{1,6}\s+(.+)$/gm, '*$1*');

    // Strikethrough: ~~text~~ → ~text~
    result = result.replace(/~~(.+?)~~/g, '~$1~');

    // Links: [text](url) → text (url)
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

    // Tables: convert to key-value pairs
    result = this._convertTables(result);

    // Restore inline code
    inlineCode.forEach((code, i) => {
      result = result.replace(`__INLINE_CODE_${i}__`, code);
    });

    // Restore code blocks
    codeBlocks.forEach((block, i) => {
      result = result.replace(`__CODE_BLOCK_${i}__`, block);
    });

    return result;
  }

  /**
   * Split a long message into chunks at line boundaries.
   * Preserves code blocks: won't split in the middle of one.
   */
  split(text) {
    if (!text || text.length <= this.maxLen) return [text];

    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= this.maxLen) {
        chunks.push(remaining);
        break;
      }

      // Find last newline before maxLen
      let splitAt = remaining.lastIndexOf('\n', this.maxLen);
      if (splitAt === -1 || splitAt < this.maxLen * 0.5) {
        // No good line break — split at maxLen
        splitAt = this.maxLen;
      }

      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).replace(/^\n/, '');
    }

    return chunks;
  }

  /**
   * Convert Markdown tables to WhatsApp-friendly key-value format.
   * | Header1 | Header2 |   →   *Header1:* Value1
   * |---------|---------|         *Header2:* Value2
   * | Value1  | Value2  |
   */
  _convertTables(text) {
    // Match table blocks: header row + separator row + data rows
    const tableRe = /^(\|.+\|)\n(\|[-:\s|]+\|)\n((?:\|.+\|\n?)+)/gm;

    return text.replace(tableRe, (match, headerRow, _separator, bodyRows) => {
      const headers = this._parseTableRow(headerRow);
      const rows = bodyRows.trim().split('\n').map(row => this._parseTableRow(row));

      const lines = [];
      for (const row of rows) {
        for (let i = 0; i < headers.length; i++) {
          const header = headers[i];
          const value = row[i] || '';
          if (value.trim()) {
            lines.push(`*${header}:* ${value}`);
          }
        }
        lines.push(''); // Blank line between rows
      }

      return lines.join('\n').trim();
    });
  }

  /**
   * Parse a markdown table row into cell values.
   */
  _parseTableRow(row) {
    return row
      .split('|')
      .filter(cell => cell.trim() !== '')
      .map(cell => cell.trim());
  }
}
