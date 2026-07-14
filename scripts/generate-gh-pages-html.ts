import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "fs";
import { join } from "path";
import { glob } from "bun";

const OUT_DIR = ".output/public";
const ASSETS_DIR = join(OUT_DIR, "assets");
const BASE = "/reef-recall/";

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
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Fishdex — Caribbean Fish Dashboard</title>
  <meta name="description" content="A pokedex-style log for the fish species you've observed." />
  <meta property="og:title" content="Fishdex — Caribbean Fish Dashboard" />
  <meta property="og:description" content="A pokedex-style log for the fish species you've observed." />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="stylesheet" href="${BASE}assets/${cssFile}" />
  <link rel="icon" href="${favicon}" type="image/x-icon" />
  <link rel="modulepreload" href="${BASE}assets/${mainJs}" />
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
