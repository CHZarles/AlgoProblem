import { isValidElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { cn } from "../../lib/cn";
import { useTheme } from "../theme";

function formatCodeLanguageLabel(raw: string) {
  const lang = raw.trim().toLowerCase();
  if (!lang) return "";
  if (lang === "cpp" || lang === "c++") return "C++";
  if (lang === "ts" || lang === "typescript") return "TS";
  if (lang === "js" || lang === "javascript") return "JS";
  if (lang === "py" || lang === "python") return "PY";
  if (lang === "csharp" || lang === "cs" || lang === "c#") return "C#";
  if (lang === "golang") return "GO";
  return lang.length <= 10 ? lang.toUpperCase() : lang.slice(0, 10).toUpperCase();
}

const SANITIZE_SCHEMA = (() => {
  const base = defaultSchema as any;
  const tagNames = Array.from(
    new Set([...(base.tagNames ?? []), "sup", "sub", "kbd", "details", "summary", "input", "mark"]),
  );

  const attrs = { ...(base.attributes ?? {}) } as Record<string, unknown[]>;
  const add = (tag: string, extra: string[]) => {
    attrs[tag] = Array.from(new Set([...(attrs[tag] ?? []), ...extra]));
  };

  add("*", ["className", "id", "title", "aria-label", "aria-hidden"]);
  add("a", ["target", "rel"]);
  add("img", ["src", "alt", "title", "width", "height", "loading"]);
  add("pre", ["className"]);
  add("code", ["className"]);
  add("span", ["className", "style", "aria-hidden"]);
  add("div", ["className", "style"]);
  add("input", ["type", "checked", "disabled"]);
  add("details", ["open"]);

  const protocols = {
    ...(base.protocols ?? {}),
    href: ["http", "https", "mailto"],
    src: ["http", "https", "data"],
  };

  return { ...base, tagNames, attributes: attrs, protocols } as any;
})();

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

function normalizeStatementLayout(markdown: string) {
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

      // LeetCode/题面里经常把 “输入/输出/解释” 拼在同一行；这里做轻量排版修复，尽量贴近原题布局。
      let s = line;
      s = s.replace(/([^\s])\s+(\*\*(?:输出|Output)\*\*[:：])/gu, "$1\n\n$2");
      s = s.replace(/([^\s])\s+(\*\*(?:解释|Explanation)\*\*[:：])/gu, "$1\n\n$2");
      s = s.replace(/([^\s])\s+(\*\*(?:提示|Constraints)\*\*[:：])/gu, "$1\n\n$2");
      s = s.replace(/((?:输入|Input)[:：][^\n]{0,600})\s+((?:输出|Output)[:：])/gu, "$1\n\n$2");
      s = s.replace(/((?:输出|Output)[:：][^\n]{0,600})\s+((?:解释|Explanation)[:：])/gu, "$1\n\n$2");
      return s;
    })
    .join("\n");
}

function normalizeLatexInMath(markdown: string) {
  const normalizeInner = (inner: string) => {
    let s = inner;
    // Some platforms emit `\\lt`/`\\le` inside TeX; `\\` is a newline in TeX, leading to literal "lt/le".
    s = s.replace(/\\\\lt\b/g, "<");
    s = s.replace(/\\\\gt\b/g, ">");
    s = s.replace(/\\\\(leqslant|leq|le|geqslant|geq|ge|neq|ne)\b/g, "\\$1");
    // `\_` renders a literal underscore in TeX; in statements it almost always means subscript.
    s = s.replace(/\\_(?=[A-Za-z0-9{])/g, "_");
    return s;
  };

  const md = markdown.replace(/\r\n/g, "\n");
  const withBlocks = md.replace(/\$\$([\s\S]*?)\$\$/g, (_m, inner: string) => `$$${normalizeInner(inner)}$$`);
  return withBlocks.replace(/\$([^\n$]*?)\$/g, (_m, inner: string) => `$${normalizeInner(inner)}$`);
}

export function Markdown({
  value,
  className,
  mode = "default",
}: {
  value: string;
  className?: string;
  mode?: "default" | "statement";
}) {
  const theme = useTheme();
  const base = normalizeLatexInMath(normalizeBoldLabels(stripOuterMarkdownFence(stripFrontmatter(value))));
  const normalized = mode === "statement" ? normalizeStatementLayout(base) : base;
  const isLight = theme.resolved === "light";
  return (
    <div
      className={cn(
        isLight ? "prose prose-sm max-w-none" : "prose prose-sm prose-invert max-w-none",
        "prose-headings:font-semibold prose-headings:tracking-tight",
        "prose-a:font-medium prose-a:underline-offset-4",
        "prose-img:rounded-xl",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        rehypePlugins={[rehypeRaw, rehypeKatex, rehypeHighlight, [rehypeSanitize, SANITIZE_SCHEMA]]}
        components={{
          a({ href, ...props }) {
            const isExternal = typeof href === "string" && /^https?:\/\//i.test(href);
            return <a href={href} target={isExternal ? "_blank" : undefined} rel={isExternal ? "noreferrer" : undefined} {...props} />;
          },
          pre({ children, ...props }) {
            const child = Array.isArray(children) ? children[0] : children;
            const className =
              isValidElement(child) && typeof (child.props as { className?: unknown }).className === "string"
                ? ((child.props as { className: string }).className as string)
                : "";
            const m = className.match(/language-([a-z0-9#+-]+)/i);
            const language = m?.[1] ? formatCodeLanguageLabel(m[1]) : "";
            return <pre {...props} data-language={language || undefined}>{children}</pre>;
          },
          table({ ...props }) {
            return (
              <div className="overflow-x-auto">
                <table {...props} />
              </div>
            );
          },
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
