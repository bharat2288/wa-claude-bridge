// Content processor — summarizes clean text for WhatsApp delivery
// Receives clean text from the Claude Agent SDK (no ANSI, no TUI chrome).
// Handles:
// - Error detection → prefix with [ERROR]
// - File change compression → one-line summaries
// - Code block truncation → first 5 lines + count
// - Reasoning truncation → first + last paragraph

import config from './config.js';

export class ContentProcessor {
  /**
   * Process clean text and return summarized output.
   * Returns null if text is empty after processing.
   */
  summarize(text) {
    if (!text || !text.trim()) return null;

    text = text.trim();

    // Errors — relay verbatim with prefix
    if (isError(text)) {
      return `[ERROR] ${text}`;
    }

    // Under threshold — send as-is
    if (text.length <= config.output.summarizeThreshold) {
      return text;
    }

    // Compress file change notifications
    text = compressFileChanges(text);

    // Truncate code blocks
    text = truncateCodeBlocks(text);

    // If still over threshold, truncate reasoning
    if (text.length > config.output.summarizeThreshold) {
      text = truncateReasoning(text);
    }

    return text;
  }
}

// --- Detection helpers ---

function isError(text) {
  const patterns = [
    /error:/i,
    /Error:/,
    /traceback/i,
    /exception/i,
    /FAILED/,
    /panic:/,
    /fatal:/i,
  ];
  return patterns.some(p => p.test(text));
}

function compressFileChanges(text) {
  const lines = text.split('\n');
  const compressed = [];
  let inDiff = false;

  for (const line of lines) {
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) {
      inDiff = true;
      continue;
    }
    if (inDiff && (line.startsWith('+') || line.startsWith('-') || line === '')) {
      continue;
    }
    inDiff = false;

    if (/^(Created|Modified|Deleted|Wrote):/i.test(line)) {
      compressed.push(`> ${line.trim()}`);
    } else {
      compressed.push(line);
    }
  }

  return compressed.join('\n');
}

function truncateCodeBlocks(text) {
  return text.replace(/```[\s\S]*?```/g, (block) => {
    const lines = block.split('\n');
    if (lines.length <= 12) return block;

    const header = lines[0];
    const preview = lines.slice(1, 6).join('\n');
    const remaining = lines.length - 6;
    return `${header}\n${preview}\n[... ${remaining} more lines — reply /full to see]\n\`\`\``;
  });
}

function truncateReasoning(text) {
  const paragraphs = text.split(/\n\n+/);

  if (paragraphs.length <= 2) {
    return text.slice(0, config.output.summarizeThreshold) + '\n[... truncated — reply /full to see]';
  }

  const first = paragraphs[0];
  const last = paragraphs[paragraphs.length - 1];
  const skipped = paragraphs.length - 2;

  return `${first}\n\n[... ${skipped} sections truncated — reply /full to see]\n\n${last}`;
}
