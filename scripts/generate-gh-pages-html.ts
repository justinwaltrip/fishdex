import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "fs";
import { join } from "path";
import { glob } from "bun";

const OUT_DIR = ".output/public";
const ASSETS_DIR = join(OUT_DIR, "assets");
const repo = process.env.GH_PAGES_REPO || "";
const BASE = repo ? `/${repo}/` : "/";

function findAsset(pattern: string): string {
  const files = readdirSync(ASSETS_DIR);
  for (const f of files) {
    if (f.match(pattern)) return f;
  }
  throw new Error(`Could not find asset matching ${pattern}`);
}

const mainJs = findAsset(/^index-.+\.js$/);
const cssFile = findAsset(/^styles-.+\.css$/);
const favicon = existsSync(join(OUT_DIR, "favicon.ico")) ? `${BASE}favicon.ico` : "/favicon.ico";

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <script>
    window.$_TSR = {
      initialized: false,
      router: { manifest: { routes: {} }, dehydratedData: {}, matches: [{ i: "__root__" }], lastMatchId: "__root__" },
      buffer: [],
      h: function () { this.initialized = true; },
    };
  </script>
</head>
<body>
  <script type="module" async src="${BASE}assets/${mainJs}"></script>
</body>
</html>
`;

const indexPath = join(OUT_DIR, "index.html");
writeFileSync(indexPath, html);
console.log(`Generated ${indexPath}`);

const notFoundPath = join(OUT_DIR, "404.html");
writeFileSync(notFoundPath, html);
console.log(`Generated ${notFoundPath}`);
