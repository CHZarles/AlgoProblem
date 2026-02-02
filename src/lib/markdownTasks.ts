function normalizeNewlines(input: string) {
  return input.replace(/\r\n/g, "\n");
}

function usesCrlf(input: string) {
  return /\r\n/.test(input);
}

function splitLines(input: string) {
  return normalizeNewlines(input).split("\n");
}

export function toggleMarkdownTaskAtIndex(markdown: string, taskIndex: number, checked: boolean) {
  const crlf = usesCrlf(markdown);
  const lines = splitLines(markdown);
  let inFence = false;
  let idx = 0;

  const out = lines.map((line) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;

    const m = line.match(/^(\s*(?:>\s*)*)(\s*(?:[-*+]|\d+[.)]))(\s+)\[([ xX])\](.*)$/);
    if (!m) return line;

    if (idx !== taskIndex) {
      idx++;
      return line;
    }

    idx++;
    const box = checked ? "x" : " ";
    return `${m[1]}${m[2]}${m[3]}[${box}]${m[5]}`;
  });

  const next = out.join(crlf ? "\r\n" : "\n");
  return next;
}

