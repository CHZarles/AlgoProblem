type CanonicalLanguage = "cpp" | "java" | "python" | "go" | "ts";

const LANGUAGE_ALIASES: Array<[string, CanonicalLanguage]> = [
  ["c++", "cpp"],
  ["cpp", "cpp"],
  ["cc", "cpp"],
  ["cxx", "cpp"],
  ["java", "java"],
  ["python", "python"],
  ["py", "python"],
  ["go", "go"],
  ["golang", "go"],
  ["typescript", "ts"],
  ["ts", "ts"],
  ["javascript", "ts"],
  ["js", "ts"],
];

function normalizeLanguageToken(raw: string): CanonicalLanguage | null {
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  for (const [alias, canonical] of LANGUAGE_ALIASES) {
    if (key === alias) return canonical;
  }
  return null;
}

function pickMostFrequent(map: Map<CanonicalLanguage, number>): CanonicalLanguage | null {
  let best: CanonicalLanguage | null = null;
  let bestCount = 0;
  for (const [k, c] of map.entries()) {
    if (!best || c > bestCount) {
      best = k;
      bestCount = c;
    }
  }
  return best;
}

function scoreText(text: string): Map<CanonicalLanguage, number> {
  const t = text;
  const scores = new Map<CanonicalLanguage, number>([
    ["cpp", 0],
    ["java", 0],
    ["python", 0],
    ["go", 0],
    ["ts", 0],
  ]);

  const add = (lang: CanonicalLanguage, delta: number) => {
    scores.set(lang, (scores.get(lang) ?? 0) + delta);
  };

  // C++
  if (/#include\s*</.test(t)) add("cpp", 4);
  if (/\busing\s+namespace\s+std\b/.test(t)) add("cpp", 3);
  if (/\bstd::[A-Za-z_][A-Za-z0-9_]*\b/.test(t)) add("cpp", 1);
  if (/\bvector\s*</.test(t)) add("cpp", 1);
  if (/\bcin\b/.test(t)) add("cpp", 1);
  if (/\bcout\b/.test(t)) add("cpp", 1);
  if (/\bint\s+main\s*\(/.test(t)) add("cpp", 2);

  // Java
  if (/\bpublic\s+class\b/.test(t)) add("java", 4);
  if (/\bstatic\s+void\s+main\s*\(/.test(t)) add("java", 2);
  if (/\bSystem\.out\./.test(t)) add("java", 3);
  if (/\bimport\s+java\./.test(t)) add("java", 2);
  if (/\bclass\s+Solution\b/.test(t)) add("java", 1);

  // Python
  if (/\bdef\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(t)) add("python", 3);
  if (/\bif\s+__name__\s*==\s*['\"]__main__['\"]\s*:/.test(t)) add("python", 4);
  if (/\bfrom\s+[A-Za-z_][A-Za-z0-9_]*\s+import\b/.test(t)) add("python", 2);
  if (/\bimport\s+[A-Za-z_][A-Za-z0-9_]*\b/.test(t)) add("python", 1);
  if (/\bprint\s*\(/.test(t)) add("python", 1);
  if (/\bself\b/.test(t)) add("python", 1);

  // Go
  if (/\bpackage\s+main\b/.test(t)) add("go", 4);
  if (/\bfunc\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(t)) add("go", 2);
  if (/\bfmt\./.test(t)) add("go", 1);
  if (/\bimport\s+\(/.test(t)) add("go", 1);

  // TS/JS
  if (/\binterface\s+[A-Za-z_][A-Za-z0-9_]*\b/.test(t)) add("ts", 2);
  if (/\btype\s+[A-Za-z_][A-Za-z0-9_]*\s*=/.test(t)) add("ts", 2);
  if (/\bexport\s+(default\s+)?/.test(t)) add("ts", 2);
  if (/\bconst\s+[A-Za-z_][A-Za-z0-9_]*\b/.test(t)) add("ts", 1);
  if (/\blet\s+[A-Za-z_][A-Za-z0-9_]*\b/.test(t)) add("ts", 1);
  if (/=>/.test(t)) add("ts", 1);
  if (/\bconsole\.log\b/.test(t)) add("ts", 1);

  return scores;
}

export function detectSolutionLanguage(markdown: string): CanonicalLanguage | null {
  const md = String(markdown ?? "");

  // 1) Prefer explicit fenced code language info string.
  const counts = new Map<CanonicalLanguage, number>();
  const fenceInfoRe = /```([^\n`]*)/g;
  let m: RegExpExecArray | null;
  while ((m = fenceInfoRe.exec(md))) {
    const info = (m[1] ?? "").trim();
    if (!info) continue;
    const token = info.split(/\s+/)[0] ?? "";
    const normalized = normalizeLanguageToken(token);
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  const fromFences = pickMostFrequent(counts);
  if (fromFences) return fromFences;

  // 2) Heuristic fallback: score the (first) code blocks, or markdown as a whole.
  const codeBlocks: string[] = [];
  const codeRe = /```[^\n]*\n([\s\S]*?)```/g;
  while ((m = codeRe.exec(md))) {
    const chunk = (m[1] ?? "").slice(0, 4000);
    if (chunk.trim()) codeBlocks.push(chunk);
    if (codeBlocks.length >= 5) break;
  }
  const haystack = (codeBlocks.join("\n\n") || md).slice(0, 20000);
  const scores = scoreText(haystack);

  let best: CanonicalLanguage | null = null;
  let bestScore = 0;
  for (const [lang, score] of scores.entries()) {
    if (!best || score > bestScore) {
      best = lang;
      bestScore = score;
    }
  }

  // Require a minimum score to avoid accidental flips on plain text.
  return bestScore >= 4 ? best : null;
}

