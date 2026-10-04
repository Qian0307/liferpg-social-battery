#!/usr/bin/env node
/**
 * 把 LifeRPG（apps/liferpg）複製到 public/ 根目錄：整個網站就是 LifeRPG，Next.js 只提供 API。
 * LifeRPG 的原始碼只維護在 apps/liferpg；複製進來的檔案是建置產物，不進 git。
 * npm 會在 build / dev 之前自動執行（prebuild、predev）。
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "..", "liferpg");
const target = join(root, "public");
const legacy = join(root, "public", "rpg");
const FILES = ["index.html", "manifest.webmanifest", "sw.js", "icons"];

if (!existsSync(join(source, "index.html"))) {
  console.error(`找不到 LifeRPG 原始碼：${source}`);
  process.exit(1);
}

rmSync(legacy, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const name of FILES) {
  rmSync(join(target, name), { recursive: true, force: true });
  cpSync(join(source, name), join(target, name), { recursive: true });
}
console.log(`已複製 LifeRPG 到 public/（${FILES.join("、")}）`);
