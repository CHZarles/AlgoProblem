import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import { cn } from "../../lib/cn";
import { useTheme } from "../theme";

function stripFrontmatter(markdown: string) {
  const md = markdown.replace(/\r\n/g, "\n");
  if (!md.startsWith("---\n")) return markdown;
  const end = md.indexOf("\n---\n", 4);
  if (end === -1) return markdown;
  return md.slice(end + "\n---\n".length).trimStart();
}

function stripOuterMarkdownFence(markdown: string) {
  const md = markdown.replace(/\r\n/g, "\n").trim();
  const m = md.match(/^```([^\n]*)\n([\s\S]*?)\n```\s*$/);
  if (!m) return markdown;

  const info = m[1].trim().toLowerCase();
  const inner = m[2];

  if (info === "markdown" || info === "md") return inner.trim();

  // Some LLMs wrap Markdown output in a plain fenced block without info string.
  // Only strip it when the inner content looks like Markdown (not pure code).
  if (!info) {
    const looksLikeMarkdown = /(^|\n)#{1,6}\s+\S/.test(inner) || /(^|\n)-\s+\S/.test(inner) || /(^|\n)\d+\.\s+\S/.test(inner);
    if (looksLikeMarkdown) return inner.trim();
  }

  return markdown;
}

function normalizeBoldLabels(markdown: string) {
  const md = markdown.replace(/\r\n/g, "\n");
  const lines = md.split("\n");
  let inFence = false;

  return lines
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;

      // CommonMark does NOT parse `**输入：**root` as strong because the closing delimiter is preceded by punctuation (`：`)
      // and followed by alphanumeric. Rewrite to `**输入**：root` (and `**Input**: height`) to keep the intended styling.
      return line.replace(/\*\*([^*\n]+?)([:：])\*\*(?=\S)/gu, (_, label: string, colon: string) => {
        const sep = colon === ":" ? ": " : "：";
        return `**${label}**${sep}`;
      });
    })
    .join("\n");
}

export function Markdown({ value, className }: { value: string; className?: string }) {
  const theme = useTheme();
  const normalized = normalizeBoldLabels(stripOuterMarkdownFence(stripFrontmatter(value)));
  return (
    <div
      className={cn(
        theme.resolved === "light"
          ? "prose max-w-none prose-pre:bg-black/5"
          : "prose prose-invert max-w-none prose-pre:bg-black/30",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex, rehypeHighlight]}>
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
