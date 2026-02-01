import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

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

  return td.turndown(html).trim();
}
