#!/usr/bin/env bun
import { $ } from "bun";
import { existsSync, rmSync, cpSync } from "fs";
import { join } from "path";

const OUT_DIR = ".output/public";
const DEPLOY_DIR = ".gh-pages-deploy";

console.log("Building for GitHub Pages...");
await $`BUILD_TARGET=gh-pages GH_PAGES_REPO=${repo} vite build && bun run scripts/generate-gh-pages-html.ts`;

if (!existsSync(OUT_DIR)) {
  console.error(`${OUT_DIR} not found — build may have failed`);
  process.exit(1);
}

if (existsSync(".gh-pages-deploy")) rmSync(".gh-pages-deploy", { recursive: true });

cpSync(OUT_DIR, DEPLOY_DIR, { recursive: true });

const cwd = process.cwd();
process.chdir(DEPLOY_DIR);

const originUrl = (await $`git remote get-url origin`.text()).trim();

const match = originUrl.match(/github\.com[:/](.+)\/(.+)\.git/);
if (!match) {
  console.error("Could not parse GitHub owner/repo from origin URL:", originUrl);
  process.exit(1);
}
const owner = match[1];
const repo = match[2];

await $`git init`;
await $`git checkout -b gh-pages`;
await $`git add -A`;
await $`git commit -m "deploy"`;
await $`git remote add origin ${originUrl}`;

console.log("Pushing to gh-pages branch...");
await $`git push -f origin gh-pages`;

process.chdir(cwd);
rmSync(DEPLOY_DIR, { recursive: true });

console.log(`Deployed! Site will be live at https://${owner}.github.io/${repo}/`);
console.log("(Make sure GitHub Pages source is set to 'Deploy from branch: gh-pages / root')");
