function lineStart(value: string, index: number) {
  const i = value.lastIndexOf("\n", Math.max(0, index - 1));
  return i === -1 ? 0 : i + 1;
}

function lineEnd(value: string, index: number) {
  const i = value.indexOf("\n", index);
  return i === -1 ? value.length : i;
}

function clamp(n: number, min: number, max: number) {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function computeLineRange(value: string, selectionStart: number, selectionEnd: number) {
  let end = selectionEnd;
  if (selectionStart !== selectionEnd && end > 0 && value[end - 1] === "\n") end -= 1;
  const startLineStart = lineStart(value, selectionStart);
  const endLineEnd = lineEnd(value, end);
  return { startLineStart, endLineEnd };
}

type IndentResult = { value: string; selectionStart: number; selectionEnd: number };

function mapPosWithinLine(pos: number, added: number, removed: number) {
  if (added) return pos + added;
  if (removed) return Math.max(0, pos - removed);
  return pos;
}

function removeIndentPrefix(line: string, indent: string) {
  if (!line) return { line, removed: 0 };
  if (line.startsWith(indent)) return { line: line.slice(indent.length), removed: indent.length };
  if (line.startsWith("\t")) return { line: line.slice(1), removed: 1 };
  const m = line.match(/^ +/);
  if (!m) return { line, removed: 0 };
  const n = Math.min(indent.length, m[0].length);
  return { line: line.slice(n), removed: n };
}

export function applyTextareaTabIndent({
  value,
  selectionStart,
  selectionEnd,
  indent = "  ",
  outdent = false,
}: {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  indent?: string;
  outdent?: boolean;
}): IndentResult {
  const start = clamp(selectionStart, 0, value.length);
  const end = clamp(selectionEnd, 0, value.length);

  if (start === end) {
    if (outdent) {
      const lineStartIdx = lineStart(value, start);
      const prefix = value.slice(lineStartIdx, start);
      if (prefix.endsWith(indent)) {
        const next = value.slice(0, start - indent.length) + value.slice(start);
        const nextPos = start - indent.length;
        return { value: next, selectionStart: nextPos, selectionEnd: nextPos };
      }
      if (prefix.endsWith("\t")) {
        const next = value.slice(0, start - 1) + value.slice(start);
        const nextPos = start - 1;
        return { value: next, selectionStart: nextPos, selectionEnd: nextPos };
      }
      return { value, selectionStart: start, selectionEnd: end };
    }

    const next = value.slice(0, start) + indent + value.slice(end);
    const nextPos = start + indent.length;
    return { value: next, selectionStart: nextPos, selectionEnd: nextPos };
  }

  const { startLineStart, endLineEnd } = computeLineRange(value, start, end);
  const block = value.slice(startLineStart, endLineEnd);
  const lines = block.split("\n");

  const lineMeta = lines.map((line) => {
    if (outdent) {
      const r = removeIndentPrefix(line, indent);
      return { oldLen: line.length, newLen: r.line.length, added: 0, removed: r.removed, line: r.line };
    }
    return { oldLen: line.length, newLen: line.length + indent.length, added: indent.length, removed: 0, line: indent + line };
  });

  const newBlock = lineMeta.map((x) => x.line).join("\n");
  const nextValue = value.slice(0, startLineStart) + newBlock + value.slice(endLineEnd);

  const mapBlockPos = (pos: number) => {
    let oldCursor = 0;
    let newCursor = 0;
    for (let i = 0; i < lineMeta.length; i++) {
      const m = lineMeta[i];
      if (pos <= oldCursor + m.oldLen) {
        const offset = pos - oldCursor;
        const mapped = mapPosWithinLine(offset, m.added, m.removed);
        return newCursor + mapped;
      }
      oldCursor += m.oldLen;
      newCursor += m.newLen;
      if (i < lineMeta.length - 1) {
        oldCursor += 1;
        newCursor += 1;
      }
    }
    return newCursor;
  };

  const startInBlock = start - startLineStart;
  const endInBlock = end - startLineStart;

  const nextStart = startLineStart + mapBlockPos(startInBlock);
  const nextEnd = startLineStart + mapBlockPos(endInBlock);

  return { value: nextValue, selectionStart: nextStart, selectionEnd: nextEnd };
}

function parseMarkdownListPrefix(line: string) {
  const quoteMatch = line.match(/^(\s*(?:>\s*)*)/);
  const quote = quoteMatch?.[1] ?? "";
  const rest = line.slice(quote.length);

  const unorderedTask = rest.match(/^(\s*)([-*+])(\s+)\[([ xX])\](\s*)(.*)$/);
  if (unorderedTask) {
    const [, indent, marker, ws1, _checked, ws2, text] = unorderedTask;
    const after = ws2.length ? ws2 : " ";
    const prefix = indent + marker + ws1 + `[ ]` + after;
    const consumedLen = (indent + marker + ws1 + `[${_checked}]` + ws2).length;
    return { kind: "task" as const, quote, indent, prefix, consumedLen, hasContent: text.trim().length > 0 };
  }

  const orderedTask = rest.match(/^(\s*)(\d+)([.)])(\s+)\[([ xX])\](\s*)(.*)$/);
  if (orderedTask) {
    const [, indent, numRaw, delim, ws1, _checked, ws2, text] = orderedTask;
    const after = ws2.length ? ws2 : " ";
    const n = Number(numRaw);
    const nextNum = Number.isFinite(n) ? String(n + 1) : "1";
    const prefix = indent + nextNum + delim + ws1 + `[ ]` + after;
    const consumedLen = (indent + numRaw + delim + ws1 + `[${_checked}]` + ws2).length;
    return { kind: "task" as const, quote, indent, prefix, consumedLen, hasContent: text.trim().length > 0 };
  }

  const unordered = rest.match(/^(\s*)([-*+])(\s+)(.*)$/);
  if (unordered) {
    const [, indent, marker, ws, text] = unordered;
    const prefix = indent + marker + ws;
    const consumedLen = prefix.length;
    return { kind: "list" as const, quote, indent, prefix, consumedLen, hasContent: text.trim().length > 0 };
  }

  const ordered = rest.match(/^(\s*)(\d+)([.)])(\s+)(.*)$/);
  if (ordered) {
    const [, indent, numRaw, delim, ws, text] = ordered;
    const n = Number(numRaw);
    const nextNum = Number.isFinite(n) ? String(n + 1) : "1";
    const prefix = indent + nextNum + delim + ws;
    const consumedLen = (indent + numRaw + delim + ws).length;
    return { kind: "list" as const, quote, indent, prefix, consumedLen, hasContent: text.trim().length > 0 };
  }

  return null;
}

export function applyTextareaMarkdownEnter({
  value,
  selectionStart,
  selectionEnd,
}: {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}): IndentResult | null {
  const start = clamp(selectionStart, 0, value.length);
  const end = clamp(selectionEnd, 0, value.length);
  if (start !== end) return null;

  const lineStartIdx = lineStart(value, start);
  const lineEndIdx = lineEnd(value, start);
  const line = value.slice(lineStartIdx, lineEndIdx);
  const posInLine = start - lineStartIdx;

  const info = parseMarkdownListPrefix(line);
  if (!info) return null;

  const prefixEndInLine = info.quote.length + info.consumedLen;
  if (posInLine < prefixEndInLine) return null;

  if (!info.hasContent && posInLine >= prefixEndInLine) {
    // Empty list item: remove marker / checkbox and keep indent (exit list).
    const keepAbs = lineStartIdx + info.quote.length + info.indent.length;
    const nextValue = value.slice(0, keepAbs) + value.slice(lineEndIdx);
    return { value: nextValue, selectionStart: keepAbs, selectionEnd: keepAbs };
  }

  const insert = "\n" + info.quote + info.prefix;
  const nextValue = value.slice(0, start) + insert + value.slice(start);
  const nextPos = start + insert.length;
  return { value: nextValue, selectionStart: nextPos, selectionEnd: nextPos };
}
