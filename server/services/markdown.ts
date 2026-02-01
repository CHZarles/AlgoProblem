import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

function normalizeStatementLayout(markdown: string) {
  const md = markdown.replace(/\r\n/g, "\n");
  const parts = md.split("```");
  for (let i = 0; i < parts.length; i += 2) {
    // outside fenced blocks
    parts[i] = parts[i]
      // Bold label variants (`**输出：**` or `**输出**：`)
      .replace(/([^\n])\s+(\*\*(?:输出|Output)(?:[:：])\*\*)/gu, "$1\n\n$2")
      .replace(/([^\n])\s+(\*\*(?:解释|Explanation)(?:[:：])\*\*)/gu, "$1\n\n$2")
      .replace(/([^\n])\s+(\*\*(?:提示|Constraints)(?:[:：])\*\*)/gu, "$1\n\n$2")
      .replace(/([^\n])\s+(\*\*(?:输出|Output)\*\*[:：])/gu, "$1\n\n$2")
      .replace(/([^\n])\s+(\*\*(?:解释|Explanation)\*\*[:：])/gu, "$1\n\n$2")
      .replace(/([^\n])\s+(\*\*(?:提示|Constraints)\*\*[:：])/gu, "$1\n\n$2")
      // Plain label variants (`输入：... 输出：... 解释：...`)
      .replace(/((?:输入|Input)[:：][^\n]{0,600})\s+((?:输出|Output)[:：])/gu, "$1\n\n$2")
      .replace(/((?:输出|Output)[:：][^\n]{0,600})\s+((?:解释|Explanation)[:：])/gu, "$1\n\n$2");
  }
  return parts.join("```");
}

export function htmlToMarkdown(html: string) {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
    bulletListMarker: "-",
  });
  td.use(gfm);

  // Preserve common math-ish formatting
  td.addRule("sup", {
    filter: "sup",
    replacement: (content) => {
      const v = content.trim();
      if (!v) return "";
      return v.length === 1 ? `^${v}` : `^{${v}}`;
    },
  });
  td.addRule("sub", {
    filter: "sub",
    replacement: (content) => {
      const v = content.trim();
      if (!v) return "";
      return v.length === 1 ? `_${v}` : `_{${v}}`;
    },
  });

  // Keep line breaks in <br>
  td.addRule("br", {
    filter: "br",
    replacement: () => "\n",
  });

  const md = td.turndown(html).trim();
  return normalizeStatementLayout(md).trim();
}
