const fs = require("node:fs");
const path = require("node:path");

/**
 * Reduce Windows installer size by removing unused Chromium locale packs.
 * Keep only the languages we want to ship.
 *
 * @param {{ appOutDir: string }} context
 */
exports.default = async function afterPack(context) {
  const localesDir = path.join(context.appOutDir, "locales");
  if (!fs.existsSync(localesDir)) return;

  const keep = new Set(["en-US.pak", "zh-CN.pak"]);
  for (const name of fs.readdirSync(localesDir)) {
    if (!name.endsWith(".pak")) continue;
    if (keep.has(name)) continue;
    try {
      fs.unlinkSync(path.join(localesDir, name));
    } catch {
      // ignore best-effort cleanup errors
    }
  }
};

