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

  // Keep line breaks in <br>
  td.addRule("br", {
    filter: "br",
    replacement: () => "\n",
  });

  return td.turndown(html).trim();
}

