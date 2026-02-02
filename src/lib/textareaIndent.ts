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

