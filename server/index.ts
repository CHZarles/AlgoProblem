import { createApp } from "./app";
import { env } from "./env";
import { migrate } from "./migrate";
import { ensureWorkspace } from "./workspace";

async function main() {
  migrate();
  ensureWorkspace();
  const e = env();
  const app = createApp();
  app.listen(e.PORT, () => {
    console.log(`[api] listening on http://localhost:${e.PORT}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
